"""Codegen unit tests over the bundled sample scenarios.

Structural assertions, not full golden files: the exact C++ text will keep
evolving, but the load-bearing constructs (helper order, RPL wiring, target
address resolution) must not silently disappear.
"""

import json
from pathlib import Path

import pytest

from app.codegen import CodegenError, generate
from app.models import AodvDiscoverApp, OnOffApp, P2pDiscoverApp, Scenario, UdpEchoApp
from app.validate import has_errors, validate_scenario

SCENARIOS = Path(__file__).resolve().parents[2] / "scenarios"


def _load(name: str) -> Scenario:
    return Scenario.model_validate(json.loads((SCENARIOS / f"{name}.json").read_text()))


def test_samples_validate_clean():
    for name in ("wifi-adhoc-ping", "rpl-line", "rpl-mesh", "rpl-aodv-mesh", "rpl-p2p-mesh"):
        issues = validate_scenario(_load(name))
        assert not has_errors(issues), [i.message for i in issues]


def test_rpl_aodv_mesh_sample_generates():
    # Confirmed against a real ./ns3 run (not just codegen): the discovery
    # from "b" to "c" completes over a direct 1-hop peer link neither node's
    # base DODAG tree route would ever use on its own.
    code = generate(_load("rpl-aodv-mesh"))
    assert "origin->DiscoverRoute(target, false);" in code
    assert 'rplHelper.Set("AodvRankLimit", UintegerValue(8));' in code


def test_rpl_p2p_mesh_sample_generates():
    # Confirmed against a real ./ns3 run (not just codegen): the discovery
    # from "b" to "c" completes over a direct 1-hop peer link neither node's
    # base DODAG tree route would ever use on its own -- same topology as
    # rpl-aodv-mesh, same physical link, a different protocol finding it.
    code = generate(_load("rpl-p2p-mesh"))
    assert "origin->DiscoverP2pRoute(target, false);" in code
    assert 'rplHelper.Set("P2pMaxRank", UintegerValue(8));' in code


def test_wifi_adhoc_ping_structure():
    code = generate(_load("wifi-adhoc-ping"))
    assert '#include "ns3/wifi-module.h"' in code
    assert '#include "ns3/internet-apps-module.h"' in code
    assert "ns3::AdhocWifiMac" in code
    assert "WIFI_STANDARD_80211g" in code
    assert "Ipv4GlobalRoutingHelper::PopulateRoutingTables()" in code
    # ping target: alice (n0) is member 0 of the only network
    assert "PingHelper app0(net0Ifaces.GetAddress(0));" in code
    # ping runs on bob (node index 1)
    assert "app0.Install(nodes.Get(1))" in code
    assert "rpl" not in code.lower().replace("ns3edit", "")


def test_rpl_line_structure():
    code = generate(_load("rpl-line"))
    assert '#include "ns3/rpl-module.h"' in code
    assert '#include "ns3/sixlowpan-module.h"' in code
    # stack order: rpl routing helper installed before sixlowpan + addresses
    assert code.index("SetRoutingHelper(rplHelper)") < code.index("Sixlowpan.Install")
    # RPL nodes SLAAC their own addresses, so none is assigned up front
    assert "ipv6Helper.SetBase" not in code
    assert "AssignWithoutAddress" in code
    assert code.index("Sixlowpan.Install") < code.index("AssignWithoutAddress")
    # root marked with its own prefix, only after AssignWithoutAddress
    assert 'rplHelper.SetRoot(nodes.Get(0), Ipv6Address("2001:1::"), 64);' in code
    assert code.index("AssignWithoutAddress") < code.index("rplHelper.SetRoot")
    assert 'rplHelper.Set("Ocp", UintegerValue(rpl::RPL_OCP_MRHOF));' in code
    assert 'rplHelper.Set("EnableLql", BooleanValue(true));' in code
    # MRHOF turns the error model on by default
    assert "LrWpanErrorModel" in code
    # the ping target only exists after SLAAC, so it is resolved at run time and
    # the ping is scheduled rather than installed up front
    assert "Ns3EditGlobalAddressOf" in code
    assert "&app0Start, nodes);" in code
    assert "PingHelper app0(net0Ifaces.GetAddress" not in code
    assert "PrintDodag" in code
    # Regression: the sender's own SLAAC address was never checked, only the
    # target's -- Ipv6L3Protocol::SourceAddressSelection() asserts if a node
    # tries to send before it has one, which a slow-to-converge DODAG can
    # still trigger well after the topology-size check passes.
    assert "senderReady" in code


def test_rpl_loop_event_wiring_always_present():
    # Unlike DumpRplTables (gated on rplTableInterval > 0), the loop-event
    # trace connect is unconditional whenever RPL routing is used: it is
    # cheap and does not depend on the periodic-sampling feature at all.
    code = generate(_load("rpl-line"))
    assert "OnRankErrorConfirmed(uint32_t nodeIndex, uint8_t instanceId)" in code
    assert '"##LOOPEVENT## "' not in code  # marker is built inline, not as a literal
    assert '"##LOOPEVENT## {\\"node\\": "' in code
    assert 'TraceConnectWithoutContext("RankErrorConfirmed",' in code
    assert "MakeBoundCallback(&OnRankErrorConfirmed, i)" in code

    no_rpl_code = generate(_load("wifi-adhoc-ping"))
    assert "OnRankErrorConfirmed" not in no_rpl_code
    assert "LOOPEVENT" not in no_rpl_code


def test_rpl_storing_mode_sets_mop():
    # Default (non-storing) omits Mop entirely -- it's contrib/rpl's own
    # attribute default, so an untouched scenario's generated code should
    # not carry a redundant Set() for it.
    assert 'rplHelper.Set("Mop"' not in generate(_load("rpl-line"))

    scenario = _load("rpl-line")
    scenario.stack.rpl[0].mop = "storing"
    code = generate(scenario)
    assert 'rplHelper.Set("Mop", UintegerValue(rpl::RPL_MOP_STORING_NO_MULTICAST));' in code


def test_rpl_udp_echo_and_onoff_resolve_target_at_runtime():
    # Regression: UdpEcho/OnOff named the target's address at configuration
    # time (net0Ifaces.GetAddress(idx, 1)), same as ping did before it was
    # fixed. Under RPL an interface has only its link-local address (index 0)
    # until SLAAC runs, so building that expression crashed
    # Ipv6Interface::GetAddress() with "index 1 out of bounds" the moment a
    # UdpEcho/OnOff app was added to an RPL scenario.
    scenario = _load("rpl-line")
    scenario.apps.append(
        UdpEchoApp(id="app-echo", server="n0", client="n2", port=9, maxPackets=5, interval=2.0)
    )
    scenario.apps.append(OnOffApp(id="app-onoff", **{"from": "n1"}, to="n0", port=9001))
    code = generate(scenario)

    # No configuration-time GetAddress(idx, 1) target for either app.
    assert "net0Ifaces.GetAddress" not in code
    assert "Ns3EditGlobalAddressOf" in code

    # Each gets its own convergence-waiting Start(), scheduled rather than
    # installed up front, mirroring the ping app's app0Start.
    assert "app1Start(NodeContainer nodes)" in code
    assert "Ns3EditGlobalAddressOf(nodes.Get(0))" in code  # echo server is n0
    assert "UdpEchoClientHelper app1Client(target, 9);" in code
    assert "&app1Start, nodes);" in code

    assert "app2Start(NodeContainer nodes)" in code
    assert 'OnOffHelper app2("ns3::UdpSocketFactory", Inet6SocketAddress(target, 9001));' in code
    assert "&app2Start, nodes);" in code

    # Regression: crashed on Ipv6L3Protocol::SourceAddressSelection() when the
    # sender itself had not SLAACed yet -- only the target's address was
    # checked. Each Start() must also confirm its own sender is ready before
    # installing the client/sender application.
    assert "Ns3EditGlobalAddressOf(nodes.Get(2))" in code  # echo client is n2
    assert "Ns3EditGlobalAddressOf(nodes.Get(1))" in code  # onoff sender is n1
    # declared once and checked once per app's Start(): ping, udpEcho, onoff
    assert code.count("senderReady") == 6

    # The server/sink side needs no address and stays installed up front.
    assert "UdpEchoServerHelper app1Server(9);" in code
    assert "PacketSinkHelper app2Sink" in code


def test_rpl_aodv_discover_structure():
    scenario = _load("rpl-line")
    scenario.apps.append(AodvDiscoverApp(id="app-discover", **{"from": "n2"}, to="n0", start=100))
    code = generate(scenario)

    assert "app1Start(NodeContainer nodes)" in code
    assert "nodes.Get(2)->GetObject<rpl::RplRoutingProtocol>();" in code
    assert "Ns3EditGlobalAddressOf(nodes.Get(0))" in code
    assert "origin->GetGlobalAddress().IsAny()" in code
    assert "origin->DiscoverRoute(target, false);" in code
    assert "Simulator::Schedule(Seconds(100.0), &app1Start, nodes);" in code

    # Unlike ping/udpEcho/onoff, discovery does not wait for the base
    # DODAG's DAO-built topology to converge -- it floods its own
    # RREQ-Instance independently of it.
    start = code.index("app1Start(NodeContainer nodes)")
    end = code.index("int\nmain(int argc")
    assert "GetTopologySize" not in code[start:end]


def test_rpl_aodv_discover_requires_rpl_routing():
    scenario = _load("wifi-adhoc-ping")
    scenario.apps.append(AodvDiscoverApp(id="app-discover", **{"from": "n0"}, to="n1"))
    with pytest.raises(CodegenError):
        generate(scenario)


def test_rpl_aodv_attributes_only_rendered_when_discovery_present():
    # Base RPL scenarios with no discovery app should not carry the AODV-RPL
    # Trickle/lifetime tuning knobs -- they would just be dead configuration.
    assert "Aodv" not in generate(_load("rpl-line"))

    scenario = _load("rpl-line")
    scenario.stack.rpl[0].aodvRankLimit = 20
    scenario.stack.rpl[0].aodvLifetime = 2
    scenario.apps.append(AodvDiscoverApp(id="app-discover", **{"from": "n2"}, to="n0"))
    code = generate(scenario)
    assert 'rplHelper.Set("AodvDioIntervalMin", TimeValue(Seconds(0.128)));' in code
    assert 'rplHelper.Set("AodvDioIntervalDoublings", UintegerValue(4));' in code
    assert 'rplHelper.Set("AodvRankLimit", UintegerValue(20));' in code
    assert 'rplHelper.Set("AodvLifetime", UintegerValue(2));' in code
    assert 'rplHelper.Set("AodvRejoinReenable", TimeValue(Seconds(900.0)));' in code


def test_rpl_aodv_force_asymmetric():
    # Default (symmetric, S=1) omits the attribute entirely.
    scenario = _load("rpl-line")
    scenario.apps.append(AodvDiscoverApp(id="app-discover", **{"from": "n2"}, to="n0"))
    assert 'rplHelper.Set("AodvForceAsymmetric"' not in generate(scenario)

    scenario.stack.rpl[0].aodvForceAsymmetric = True
    code = generate(scenario)
    assert 'rplHelper.Set("AodvForceAsymmetric", BooleanValue(true));' in code


def test_rpl_p2p_discover_structure():
    scenario = _load("rpl-line")
    scenario.apps.append(P2pDiscoverApp(id="app-discover", **{"from": "n2"}, to="n0", start=100))
    code = generate(scenario)

    assert "app1Start(NodeContainer nodes)" in code
    assert "nodes.Get(2)->GetObject<rpl::RplRoutingProtocol>();" in code
    assert "Ns3EditGlobalAddressOf(nodes.Get(0))" in code
    assert "origin->GetGlobalAddress().IsAny()" in code
    assert "origin->DiscoverP2pRoute(target, false);" in code
    assert "Simulator::Schedule(Seconds(100.0), &app1Start, nodes);" in code

    # Unlike ping/udpEcho/onoff, discovery does not wait for the base
    # DODAG's DAO-built topology to converge -- it floods its own
    # temporary DAG independently of it.
    start = code.index("app1Start(NodeContainer nodes)")
    end = code.index("int\nmain(int argc")
    assert "GetTopologySize" not in code[start:end]


def test_rpl_discover_hop_by_hop_flag():
    # H=1 must actually reach the generated Discover*Route() call, not just
    # exist as an ignored model field.
    scenario = _load("rpl-line")
    scenario.apps.append(
        AodvDiscoverApp(id="app-aodv", **{"from": "n2"}, to="n0", hopByHop=True)
    )
    scenario.apps.append(
        P2pDiscoverApp(id="app-p2p", **{"from": "n2"}, to="n0", hopByHop=True)
    )
    code = generate(scenario)
    assert "origin->DiscoverRoute(target, true);" in code
    assert "origin->DiscoverP2pRoute(target, true);" in code


def test_rpl_p2p_num_routes():
    # N is always rendered (its own default, 0, is meaningful on the wire --
    # unlike the Trickle/lifetime knobs above it, 0 is not "unset").
    scenario = _load("rpl-line")
    scenario.apps.append(P2pDiscoverApp(id="app-discover", **{"from": "n2"}, to="n0"))
    code = generate(scenario)
    assert 'rplHelper.Set("P2pNumRoutes", UintegerValue(0));' in code
    assert 'rplHelper.Set("P2pDroCollectWindow"' not in code

    scenario.stack.rpl[0].p2pNumRoutes = 2
    scenario.stack.rpl[0].p2pDroCollectWindow = 0.5
    code = generate(scenario)
    assert 'rplHelper.Set("P2pNumRoutes", UintegerValue(2));' in code
    assert 'rplHelper.Set("P2pDroCollectWindow", TimeValue(Seconds(0.5)));' in code


def test_rpl_p2p_discover_requires_rpl_routing():
    scenario = _load("wifi-adhoc-ping")
    scenario.apps.append(P2pDiscoverApp(id="app-discover", **{"from": "n0"}, to="n1"))
    with pytest.raises(CodegenError):
        generate(scenario)


def test_rpl_p2p_attributes_only_rendered_when_discovery_present():
    # Base RPL scenarios with no discovery app should not carry the P2P-RPL
    # Trickle/lifetime tuning knobs -- they would just be dead configuration.
    assert "P2pDio" not in generate(_load("rpl-line"))

    scenario = _load("rpl-line")
    scenario.stack.rpl[0].p2pMaxRank = 20
    scenario.stack.rpl[0].p2pLifetime = 1
    scenario.apps.append(P2pDiscoverApp(id="app-discover", **{"from": "n2"}, to="n0"))
    code = generate(scenario)
    assert 'rplHelper.Set("P2pDioIntervalMin", TimeValue(Seconds(0.064)));' in code
    assert 'rplHelper.Set("P2pDioIntervalDoublings", UintegerValue(4));' in code
    assert 'rplHelper.Set("P2pDioRedundancy", UintegerValue(1));' in code
    assert 'rplHelper.Set("P2pMaxRank", UintegerValue(20));' in code
    assert 'rplHelper.Set("P2pLifetime", UintegerValue(1));' in code
    assert 'rplHelper.Set("P2pDroAckRequested", BooleanValue(true));' in code
    assert 'rplHelper.Set("P2pDroAckWaitTime", TimeValue(Seconds(1.0)));' in code
    assert 'rplHelper.Set("P2pDroMaxRetransmissions", UintegerValue(3));' in code


def test_rpl_table_snapshots_scheduled_by_default():
    code = generate(_load("rpl-line"))
    # The marker is the whole contract with RunManager._pump(); losing it
    # turns the snapshots back into unparsed log noise.
    assert '"##RPLTABLE## "' in code
    assert "PrintRoutingTableJson" in code
    assert "&DumpRplTables" in code
    # Self-rescheduling, so the pending event count does not grow with the
    # run length.
    assert code.count("Simulator::Schedule(interval, &DumpRplTables") == 1
    # The readable end-of-run dump stays: it is what the run log carries.
    assert "PrintDodag" in code


def test_rpl_table_dump_also_emits_each_nodes_address():
    # PrintRoutingTableJson() has no field for a node's own address (only its
    # candidates' and its topology's), so the canvas's parent-link overlay
    # has nothing to resolve preferredParent against without this: emitted
    # by the generated code itself, not contrib/rpl.
    code = generate(_load("rpl-line"))
    assert "##RPLADDR## " in code
    assert "GetObject<Ipv6>()" in code


def test_rpl_table_snapshots_can_be_turned_off():
    scenario = _load("rpl-line")
    scenario.simulation.rplTableInterval = 0
    code = generate(scenario)
    assert "DumpRplTables" not in code
    assert "##RPLTABLE##" not in code
    # ...without taking the readable dump down with them.
    assert "PrintDodag" in code


def test_rpl_table_interval_negative_reads_as_off():
    scenario = _load("rpl-line")
    scenario.simulation.rplTableInterval = -5
    assert "DumpRplTables" not in generate(scenario)


def test_non_rpl_scenario_has_no_table_snapshots():
    assert "DumpRplTables" not in generate(_load("wifi-adhoc-ping"))


def test_rpl_error_model_override_off():
    scenario = _load("rpl-line")
    scenario.networks[0].lrwpan.errorModel = False
    assert "LrWpanErrorModel" not in generate(scenario)


def test_rpl_of0_no_error_model():
    scenario = _load("rpl-line")
    scenario.stack.rpl[0].ocp = "of0"
    code = generate(scenario)
    assert "LrWpanErrorModel" not in code
    assert "RPL_OCP_MRHOF" not in code


def test_rpl_core_attributes_default_to_no_extra_set_calls():
    # An untouched scenario's generated code must stay as small as it was
    # before these 9 attributes existed on RplConfig.
    code = generate(_load("rpl-line"))
    for name in (
        "DisInterval",
        "DioIntervalMin",
        "DioIntervalDoublings",
        "DioRedundancy",
        "MinHopRankIncrease",
        "DaoInterval",
        "DaoAckTimeout",
        "DaoRetries",
        "PathLifetime",
    ):
        assert f'rplHelper.Set("{name}"' not in code


def test_rpl_core_attributes_rendered_when_non_default():
    scenario = _load("rpl-line")
    base = scenario.stack.rpl[0]
    # Explicit floats for the Time-typed fields: direct attribute assignment
    # on an already-constructed model bypasses Pydantic's int -> float
    # coercion (only model_validate() does that), unlike a real request body.
    base.disInterval = 15.0
    base.dioIntervalMin = 2.048
    base.dioIntervalDoublings = 4
    base.dioRedundancy = 10
    base.minHopRankIncrease = 256
    base.daoInterval = 30.0
    base.daoAckTimeout = 2.0
    base.daoRetries = 5
    base.pathLifetime = 60
    code = generate(scenario)
    assert 'rplHelper.Set("DisInterval", TimeValue(Seconds(15.0)));' in code
    assert 'rplHelper.Set("DioIntervalMin", TimeValue(Seconds(2.048)));' in code
    assert 'rplHelper.Set("DioIntervalDoublings", UintegerValue(4));' in code
    assert 'rplHelper.Set("DioRedundancy", UintegerValue(10));' in code
    assert 'rplHelper.Set("MinHopRankIncrease", UintegerValue(256));' in code
    assert 'rplHelper.Set("DaoInterval", TimeValue(Seconds(30.0)));' in code
    assert 'rplHelper.Set("DaoAckTimeout", TimeValue(Seconds(2.0)));' in code
    assert 'rplHelper.Set("DaoRetries", UintegerValue(5));' in code
    assert 'rplHelper.Set("PathLifetime", UintegerValue(60));' in code


def test_rpl_requires_ipv6():
    scenario = _load("rpl-line")
    scenario.stack.ip = "ipv4"
    with pytest.raises(CodegenError):
        generate(scenario)


def test_global_routing_rejected_on_ipv6():
    scenario = _load("wifi-adhoc-ping")
    scenario.stack.ip = "ipv6"
    with pytest.raises(CodegenError):
        generate(scenario)


def test_p2p_member_count_enforced():
    scenario = _load("wifi-adhoc-ping")
    scenario.networks[0].type = "p2p"
    scenario.networks[0].members = ["n0"]
    with pytest.raises(CodegenError):
        generate(scenario)


def test_isolated_node_is_warning_not_error():
    scenario = _load("wifi-adhoc-ping")
    scenario.nodes.append(type(scenario.nodes[0])(id="n9", name="lonely", x=0, y=0))
    issues = validate_scenario(scenario)
    assert any(i.level == "warning" and i.elementId == "n9" for i in issues)
    assert not has_errors(issues)


def test_app_endpoint_on_unjoined_node_is_an_error_at_validate_time():
    # Before this check existed, a scenario like this would validate clean
    # and only fail with a 422 once /api/run actually tried to generate it
    # (codegen._target_address_expr has no address to resolve). Promoting it
    # to a validate-time error means the 問題 tab shows it before the user
    # ever presses 実行.
    scenario = _load("wifi-adhoc-ping")
    scenario.nodes.append(type(scenario.nodes[0])(id="n9", name="lonely", x=0, y=0))
    scenario.apps[0].to = "n9"
    issues = validate_scenario(scenario)
    assert any(
        i.level == "error" and i.elementId == scenario.apps[0].id and "lonely" in i.message
        for i in issues
    ), [i.message for i in issues if i.elementId == scenario.apps[0].id]
    with pytest.raises(CodegenError):
        generate(scenario)


def test_slug_is_filesystem_safe():
    scenario = _load("wifi-adhoc-ping")
    scenario.name = "My Scenario (v2)!"
    assert scenario.slug() == "ns3edit-my-scenario-v2"
