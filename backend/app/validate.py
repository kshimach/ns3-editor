# Copyright (c) 2026 kawashy. All rights reserved.
# Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
# without written permission.

"""Scenario consistency checks run before code generation.

Every problem is reported as an Issue bound to the offending element id so
the frontend can highlight it. "error" blocks generation; "warning" does not.
"""

from __future__ import annotations

from pydantic import BaseModel

from .models import (
    AodvDiscoverApp,
    Network,
    NetworkType,
    OnOffApp,
    P2pDiscoverApp,
    PingApp,
    Scenario,
    UdpEchoApp,
)


class Issue(BaseModel):
    level: str  # "error" | "warning"
    elementId: str | None = None
    message: str


def _err(issues: list[Issue], element_id: str | None, message: str) -> None:
    issues.append(Issue(level="error", elementId=element_id, message=message))


def _warn(issues: list[Issue], element_id: str | None, message: str) -> None:
    issues.append(Issue(level="warning", elementId=element_id, message=message))


def _app_endpoints(app) -> list[str]:
    if isinstance(app, (PingApp, OnOffApp, AodvDiscoverApp, P2pDiscoverApp)):
        return [app.fromNode, app.to]
    if isinstance(app, UdpEchoApp):
        return [app.client, app.server]
    return []


def validate_scenario(scenario: Scenario) -> list[Issue]:
    issues: list[Issue] = []
    node_ids = {n.id for n in scenario.nodes}

    if not scenario.nodes:
        _err(issues, None, "ノードが 1 つもありません")

    # Unique ids across nodes and networks (they share the canvas namespace).
    seen: set[str] = set()
    for element_id in [n.id for n in scenario.nodes] + [n.id for n in scenario.networks]:
        if element_id in seen:
            _err(issues, element_id, f"ID '{element_id}' が重複しています")
        seen.add(element_id)

    connected: set[str] = set()
    for net in scenario.networks:
        _validate_network(scenario, net, node_ids, issues)
        connected.update(net.members)

    for node in scenario.nodes:
        if node.id not in connected:
            _warn(issues, node.id, f"ノード '{node.name or node.id}' がどのネットワークにも属していません")

    _validate_stack(scenario, node_ids, issues)
    _validate_apps(scenario, node_ids, issues)
    return issues


def _validate_network(
    scenario: Scenario, net: Network, node_ids: set[str], issues: list[Issue]
) -> None:
    unknown = [m for m in net.members if m not in node_ids]
    if unknown:
        _err(issues, net.id, f"存在しないノードを参照しています: {', '.join(unknown)}")
    if len(set(net.members)) != len(net.members):
        _err(issues, net.id, "同じノードが二重に接続されています")

    if net.type == NetworkType.P2P:
        if len(net.members) != 2:
            _err(issues, net.id, "p2p リンクはノードちょうど 2 つを結ぶ必要があります")
    else:
        if len(net.members) < 2:
            _warn(issues, net.id, "メンバーが 2 ノード未満のセグメントは通信できません")

    if net.type == NetworkType.WIFI_INFRA:
        ap = net.wifi.apNode
        if not ap:
            _err(issues, net.id, "wifiInfra には AP となるノード (apNode) の指定が必要です")
        elif ap not in net.members:
            _err(issues, net.id, f"AP '{ap}' がこのセグメントのメンバーに含まれていません")

    if net.type == NetworkType.LRWPAN and scenario.stack.ip != "ipv6":
        _err(issues, net.id, "lr-wpan (6LoWPAN) セグメントは IPv6 スタックが必要です")


def _validate_stack(scenario: Scenario, node_ids: set[str], issues: list[Issue]) -> None:
    stack = scenario.stack
    if stack.routing == "global" and stack.ip != "ipv4":
        _err(issues, None, "global ルーティングは IPv4 専用です (IPv6 では static か rpl を選択)")
    if stack.routing == "rpl":
        if stack.ip != "ipv6":
            _err(issues, None, "RPL は IPv6 専用です")
        if not stack.rpl:
            _err(issues, None, "RPL インスタンスが 1 つも定義されていません")
        else:
            # Only the base instance (index 0) is actually wired into ns-3 by
            # codegen, so it is the only one validated here; any further
            # instances are inert scaffolding until contrib/rpl gains a way
            # to join a second RPL Instance.
            base = stack.rpl[0]
            if not base.root:
                _err(issues, None, "RPL の DODAG root ノードが未指定です")
            elif base.root not in node_ids:
                _err(issues, None, f"RPL root '{base.root}' が存在しません")
            else:
                in_lrwpan = any(
                    base.root in net.members
                    for net in scenario.networks
                    if net.type == NetworkType.LRWPAN
                )
                if not in_lrwpan:
                    _warn(
                        issues,
                        base.root,
                        "RPL root が lr-wpan セグメントに接続されていません",
                    )
        if not any(net.type == NetworkType.LRWPAN for net in scenario.networks):
            _err(issues, None, "RPL には lr-wpan セグメントが少なくとも 1 つ必要です")


def _validate_apps(scenario: Scenario, node_ids: set[str], issues: list[Issue]) -> None:
    duration = scenario.simulation.duration
    connected = {m for net in scenario.networks for m in net.members}
    for app in scenario.apps:
        endpoints = _app_endpoints(app)
        for endpoint in endpoints:
            if endpoint not in node_ids:
                _err(issues, app.id, f"存在しないノードを参照しています: {endpoint}")
            elif endpoint not in connected:
                # codegen's _target_address_expr() has no address to resolve
                # for a node that never joined any network, and raises
                # CodegenError -- surfacing that only at generate/run time
                # would make a scenario look clean here and then fail with a
                # 422 anyway, so it is promoted to an error up front.
                name = next((n.name or n.id for n in scenario.nodes if n.id == endpoint), endpoint)
                _err(
                    issues,
                    app.id,
                    f"ノード '{name}' がどのネットワークにも属していないため、アドレスを解決できません",
                )
        if len(endpoints) == 2 and endpoints[0] == endpoints[1] and endpoints[0] in node_ids:
            _warn(issues, app.id, "送信元と宛先が同じノードです")
        if app.start >= duration:
            _warn(issues, app.id, f"開始時刻 {app.start}s がシミュレーション時間 {duration}s 以降です")
        stop = getattr(app, "stop", None)  # AodvDiscoverApp/P2pDiscoverApp are one-shot, no stop
        if stop is not None and stop <= app.start:
            _err(issues, app.id, "停止時刻が開始時刻以前です")
        if isinstance(app, AodvDiscoverApp) and scenario.stack.routing != "rpl":
            _err(issues, app.id, "AODV-RPL 経路探索には RPL ルーティングが必要です")
        if isinstance(app, P2pDiscoverApp) and scenario.stack.routing != "rpl":
            _err(issues, app.id, "P2P-RPL 経路探索には RPL ルーティングが必要です")


def has_errors(issues: list[Issue]) -> bool:
    return any(issue.level == "error" for issue in issues)
