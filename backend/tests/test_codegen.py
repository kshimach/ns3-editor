"""Codegen unit tests over the bundled sample scenarios.

Structural assertions, not full golden files: the exact C++ text will keep
evolving, but the load-bearing constructs (helper order, RPL wiring, target
address resolution) must not silently disappear.
"""

import json
from pathlib import Path

import pytest

from app.codegen import CodegenError, generate
from app.models import Scenario
from app.validate import has_errors, validate_scenario

SCENARIOS = Path(__file__).resolve().parents[2] / "scenarios"


def _load(name: str) -> Scenario:
    return Scenario.model_validate(json.loads((SCENARIOS / f"{name}.json").read_text()))


def test_samples_validate_clean():
    for name in ("wifi-adhoc-ping", "rpl-line"):
        issues = validate_scenario(_load(name))
        assert not has_errors(issues), [i.message for i in issues]


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


def test_rpl_error_model_override_off():
    scenario = _load("rpl-line")
    scenario.networks[0].lrwpan.errorModel = False
    assert "LrWpanErrorModel" not in generate(scenario)


def test_rpl_of0_no_error_model():
    scenario = _load("rpl-line")
    scenario.stack.rpl.ocp = "of0"
    code = generate(scenario)
    assert "LrWpanErrorModel" not in code
    assert "RPL_OCP_MRHOF" not in code


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


def test_slug_is_filesystem_safe():
    scenario = _load("wifi-adhoc-ping")
    scenario.name = "My Scenario (v2)!"
    assert scenario.slug() == "ns3edit-my-scenario-v2"
