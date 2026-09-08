# Copyright (c) 2026 kawashy. All rights reserved.
# Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
# without written permission.

"""Scenario JSON -> ns-3 C++ scratch program.

All structural decisions (device/index mapping, address bases, app target
resolution) are computed here in Python; the Jinja2 template stays a mostly
linear rendering of the resulting context, so the generated C++ layout is
easy to follow in templates/scenario.cc.j2.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined

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
from .validate import Issue, has_errors, validate_scenario

_TEMPLATE_DIR = Path(__file__).parent / "templates"

_WIFI_STANDARDS = {
    "80211a": "WIFI_STANDARD_80211a",
    "80211b": "WIFI_STANDARD_80211b",
    "80211g": "WIFI_STANDARD_80211g",
    "80211n": "WIFI_STANDARD_80211n",
    "80211ac": "WIFI_STANDARD_80211ac",
    "80211ax": "WIFI_STANDARD_80211ax",
}

_LOSS_MODELS = {
    "logDistance": "ns3::LogDistancePropagationLossModel",
    "friis": "ns3::FriisPropagationLossModel",
}


class CodegenError(Exception):
    """Raised when the scenario has validation errors; carries the issues."""

    def __init__(self, issues: list[Issue]):
        super().__init__("scenario has validation errors")
        self.issues = issues


def _env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(_TEMPLATE_DIR),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )
    return env


def _camel(name: str) -> str:
    parts = re.split(r"[^a-zA-Z0-9]+", name)
    return "".join(p.capitalize() for p in parts if p)


def _target_address_expr(scenario: Scenario, node_id: str, ipv6: bool) -> str:
    """C++ expression for the first assigned address of a node.

    Uses the first network that contains the node; the member order inside a
    network is preserved all the way to the interface container, so the
    member index doubles as the interface-container index.
    """
    for i, net in enumerate(scenario.networks):
        if node_id in net.members:
            idx = net.members.index(node_id)
            if ipv6:
                # Position 0 is link-local; 1 is the global address.
                return f"net{i}Ifaces.GetAddress({idx}, 1)"
            return f"net{i}Ifaces.GetAddress({idx})"
    raise CodegenError(
        [Issue(level="error", elementId=node_id, message="ノードがどのネットワークにも属していません")]
    )


def _rpl_root_prefix(scenario: Scenario) -> str:
    """The /64 prefix the RPL root SLAACs its DODAGID from.

    Reuses the IPv6 base of the network the root sits on, so it matches the
    prefix the rest of that network would otherwise have been numbered from.
    """
    root = scenario.stack.rpl[0].root
    for i, net in enumerate(scenario.networks):
        if root in net.members:
            return f"2001:{i + 1}::"
    return "2001:1::"


def _network_ctx(scenario: Scenario, i: int, net: Network, rpl_mrhof: bool) -> dict[str, Any]:
    ctx: dict[str, Any] = {
        "cvar": f"net{i}",
        "id": net.id,
        "type": net.type.value,
        "member_indices": [scenario.node_index(m) for m in net.members],
        "ipv4_base": f"10.1.{i + 1}.0",
        "ipv6_base": f"2001:{i + 1}::",
    }
    if net.type == NetworkType.P2P:
        ctx.update(data_rate=net.p2p.dataRate, delay=net.p2p.delay)
    elif net.type == NetworkType.CSMA:
        ctx.update(data_rate=net.csma.dataRate, delay=net.csma.delay)
    elif net.type in (NetworkType.WIFI_ADHOC, NetworkType.WIFI_INFRA):
        ctx.update(
            standard=_WIFI_STANDARDS[net.wifi.standard],
            ssid=net.wifi.ssid,
            infra=net.type == NetworkType.WIFI_INFRA,
        )
        if net.type == NetworkType.WIFI_INFRA:
            ctx["ap_member_pos"] = net.members.index(net.wifi.apNode)
    elif net.type == NetworkType.LRWPAN:
        error_model = net.lrwpan.errorModel
        if error_model is None:
            # Same reasoning as contrib/rpl/examples/rpl-6lowpan-simple.cc:
            # MRHOF's ETX only becomes meaningful when the LQI varies.
            error_model = rpl_mrhof
        ctx.update(
            pan_id=net.lrwpan.panId,
            loss_model=_LOSS_MODELS[net.lrwpan.lossModel],
            error_model=error_model,
        )
    return ctx


def _app_ctx(scenario: Scenario, i: int, app, ipv6: bool) -> dict[str, Any]:
    duration = scenario.simulation.duration
    common = {
        "cvar": f"app{i}",
        "id": app.id,
        "kind": app.type,
        "start": app.start,
    }
    if isinstance(app, (AodvDiscoverApp, P2pDiscoverApp)):
        # One-shot DiscoverRoute()/DiscoverP2pRoute() call, not an installed
        # application: no stop time, and the target is resolved at runtime
        # (Ns3EditGlobalAddressOf), never as a compile-time address expression.
        common.update(
            from_index=scenario.node_index(app.fromNode),
            to_index=scenario.node_index(app.to),
            hop_by_hop=app.hopByHop,
        )
        return common
    common["stop"] = app.stop if app.stop is not None else duration
    if isinstance(app, PingApp):
        common.update(
            from_index=scenario.node_index(app.fromNode),
            to_index=scenario.node_index(app.to),
            target=_target_address_expr(scenario, app.to, ipv6),
            count=app.count,
            interval=app.interval,
        )
    elif isinstance(app, UdpEchoApp):
        common.update(
            server_index=scenario.node_index(app.server),
            client_index=scenario.node_index(app.client),
            target=_target_address_expr(scenario, app.server, ipv6),
            port=app.port,
            max_packets=app.maxPackets,
            interval=app.interval,
            packet_size=app.packetSize,
        )
    elif isinstance(app, OnOffApp):
        socket_addr = "Inet6SocketAddress" if ipv6 else "InetSocketAddress"
        any_addr = "Ipv6Address::GetAny()" if ipv6 else "Ipv4Address::GetAny()"
        common.update(
            from_index=scenario.node_index(app.fromNode),
            to_index=scenario.node_index(app.to),
            target=_target_address_expr(scenario, app.to, ipv6),
            port=app.port,
            data_rate=app.dataRate,
            packet_size=app.packetSize,
            socket_addr=socket_addr,
            any_addr=any_addr,
        )
    return common


def build_context(scenario: Scenario) -> dict[str, Any]:
    ipv6 = scenario.stack.ip == "ipv6"
    rpl = scenario.stack.routing == "rpl"
    rpl_mrhof = rpl and scenario.stack.rpl[0].ocp == "mrhof"
    scale = scenario.simulation.scale

    types = {net.type for net in scenario.networks}
    networks = [_network_ctx(scenario, i, net, rpl_mrhof) for i, net in enumerate(scenario.networks)]
    apps = [_app_ctx(scenario, i, app, ipv6) for i, app in enumerate(scenario.apps)]
    has_aodv_discover = any(isinstance(a, AodvDiscoverApp) for a in scenario.apps)
    has_p2p_discover = any(isinstance(a, P2pDiscoverApp) for a in scenario.apps)

    return {
        "scenario_name": scenario.name,
        "slug": scenario.slug(),
        "component": "Ns3Edit" + (_camel(scenario.name) or "Scenario"),
        "duration": scenario.simulation.duration,
        "seed": max(1, scenario.simulation.seed),
        "pcap": scenario.simulation.pcap,
        "log_components": scenario.simulation.logComponents,
        "nodes": [
            {"index": i, "name": n.name or n.id, "x": n.x * scale, "y": n.y * scale}
            for i, n in enumerate(scenario.nodes)
        ],
        "networks": networks,
        "apps": apps,
        "ipv6": ipv6,
        "rpl": (
            {
                "root_index": scenario.node_index(scenario.stack.rpl[0].root),
                "root_prefix": _rpl_root_prefix(scenario),
                "mrhof": rpl_mrhof,
                "enable_lql": scenario.stack.rpl[0].enableLql,
                "storing": scenario.stack.rpl[0].mop == "storing",
                # Clamped at zero so a negative interval reads as "off"
                # rather than scheduling an event in the past forever.
                "table_interval": max(0.0, scenario.simulation.rplTableInterval),
                "dis_interval": scenario.stack.rpl[0].disInterval,
                "dio_interval_min": scenario.stack.rpl[0].dioIntervalMin,
                "dio_interval_doublings": scenario.stack.rpl[0].dioIntervalDoublings,
                "dio_redundancy": scenario.stack.rpl[0].dioRedundancy,
                "min_hop_rank_increase": scenario.stack.rpl[0].minHopRankIncrease,
                "dao_interval": scenario.stack.rpl[0].daoInterval,
                "dao_ack_timeout": scenario.stack.rpl[0].daoAckTimeout,
                "dao_retries": scenario.stack.rpl[0].daoRetries,
                "path_lifetime": scenario.stack.rpl[0].pathLifetime,
                "aodv_dio_interval_min": scenario.stack.rpl[0].aodvDioIntervalMin,
                "aodv_dio_interval_doublings": scenario.stack.rpl[0].aodvDioIntervalDoublings,
                "aodv_rank_limit": scenario.stack.rpl[0].aodvRankLimit,
                "aodv_lifetime": scenario.stack.rpl[0].aodvLifetime,
                "aodv_rejoin_reenable": scenario.stack.rpl[0].aodvRejoinReenable,
                "aodv_force_asymmetric": scenario.stack.rpl[0].aodvForceAsymmetric,
                "p2p_dio_interval_min": scenario.stack.rpl[0].p2pDioIntervalMin,
                "p2p_dio_interval_doublings": scenario.stack.rpl[0].p2pDioIntervalDoublings,
                "p2p_dio_redundancy": scenario.stack.rpl[0].p2pDioRedundancy,
                "p2p_max_rank": scenario.stack.rpl[0].p2pMaxRank,
                "p2p_lifetime": scenario.stack.rpl[0].p2pLifetime,
                "p2p_dro_ack_requested": scenario.stack.rpl[0].p2pDroAckRequested,
                "p2p_dro_ack_wait_time": scenario.stack.rpl[0].p2pDroAckWaitTime,
                "p2p_dro_max_retransmissions": scenario.stack.rpl[0].p2pDroMaxRetransmissions,
                "p2p_num_routes": scenario.stack.rpl[0].p2pNumRoutes,
                "p2p_dro_collect_window": scenario.stack.rpl[0].p2pDroCollectWindow,
            }
            if rpl
            else None
        ),
        "global_routing": scenario.stack.routing == "global",
        "has_p2p": NetworkType.P2P in types,
        "has_csma": NetworkType.CSMA in types,
        "has_wifi": bool(types & {NetworkType.WIFI_ADHOC, NetworkType.WIFI_INFRA}),
        "has_lrwpan": NetworkType.LRWPAN in types,
        "has_ping": any(isinstance(a, PingApp) for a in scenario.apps),
        "has_udp_echo": any(isinstance(a, UdpEchoApp) for a in scenario.apps),
        "has_onoff": any(isinstance(a, OnOffApp) for a in scenario.apps),
        "has_aodv_discover": has_aodv_discover,
        "has_p2p_discover": has_p2p_discover,
    }


def generate(scenario: Scenario) -> str:
    """Validate and render; raises CodegenError when validation fails."""
    issues = validate_scenario(scenario)
    if has_errors(issues):
        raise CodegenError(issues)
    template = _env().get_template("scenario.cc.j2")
    return template.render(**build_context(scenario))
