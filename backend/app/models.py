"""Pydantic schema for the scenario JSON the frontend edits.

The schema is the single source of truth shared by validation, code
generation and the REST API. Version it (Scenario.version) so saved
scenarios can be migrated later.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field


class NetworkType(str, Enum):
    P2P = "p2p"
    CSMA = "csma"
    WIFI_ADHOC = "wifiAdhoc"
    WIFI_INFRA = "wifiInfra"
    LRWPAN = "lrwpan"


class Node(BaseModel):
    """A device node placed on the canvas."""

    id: str
    name: str = ""
    x: float = 0.0
    y: float = 0.0


class P2pParams(BaseModel):
    dataRate: str = "5Mbps"
    delay: str = "2ms"


class CsmaParams(BaseModel):
    dataRate: str = "100Mbps"
    delay: str = "6560ns"


class WifiParams(BaseModel):
    standard: Literal["80211a", "80211b", "80211g", "80211n", "80211ac", "80211ax"] = "80211g"
    ssid: str = "ns3-ssid"
    # wifiInfra only: which member acts as the access point.
    apNode: str | None = None


class LrwpanParams(BaseModel):
    panId: int = 1
    lossModel: Literal["logDistance", "friis"] = "logDistance"
    # None = automatic: attach an LrWpanErrorModel when RPL runs MRHOF so the
    # LQI actually varies (mirrors contrib/rpl/examples/rpl-6lowpan-simple.cc).
    errorModel: bool | None = None


class Network(BaseModel):
    """A link (p2p) or shared segment (csma/wifi/lrwpan) between nodes.

    p2p has exactly two members and is drawn as a direct edge; the other
    types are drawn as a hub icon at (x, y) with spokes to the members.
    """

    id: str
    type: NetworkType
    members: list[str] = Field(default_factory=list)
    x: float = 0.0
    y: float = 0.0
    p2p: P2pParams = Field(default_factory=P2pParams)
    csma: CsmaParams = Field(default_factory=CsmaParams)
    wifi: WifiParams = Field(default_factory=WifiParams)
    lrwpan: LrwpanParams = Field(default_factory=LrwpanParams)


class RplConfig(BaseModel):
    id: str
    root: str = ""
    ocp: Literal["of0", "mrhof"] = "of0"
    enableLql: bool = False
    # AODV-RPL (RFC 9854) route-discovery tuning, mirrored from the defaults
    # on rpl::RplRoutingProtocol's own TypeId (contrib/rpl). Only rendered
    # into rplHelper.Set(...) calls when the scenario actually has an
    # aodvDiscover app (see codegen.build_context's has_aodv_discover).
    aodvDioIntervalMin: float = 0.128
    aodvDioIntervalDoublings: int = Field(default=4, ge=0, le=255)
    aodvRankLimit: int = Field(default=8, ge=0, le=127)
    aodvLifetime: int = Field(default=1, ge=0, le=3)
    aodvRejoinReenable: float = 900.0


class StackConfig(BaseModel):
    ip: Literal["ipv4", "ipv6"] = "ipv4"
    # global routing is IPv4-only; rpl is IPv6-only (validated in validate.py)
    routing: Literal["global", "static", "rpl"] = "global"
    # Only rpl[0] (the base DODAG instance) is actually wired into ns-3 by
    # codegen today: contrib/rpl has no API yet to join a second RPL
    # Instance (RFC 6550 section 5.1 local instance space). The list exists
    # so multi-instance scenarios (AODV-RPL, P2P-RPL) don't need another
    # breaking schema change once that lands.
    rpl: list[RplConfig] = Field(default_factory=lambda: [RplConfig(id="rpl0")])


class PingApp(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: Literal["ping"] = "ping"
    id: str
    fromNode: str = Field(alias="from")
    to: str
    start: float = 1.0
    stop: float | None = None
    count: int = 5
    interval: float = 1.0


class UdpEchoApp(BaseModel):
    type: Literal["udpEcho"] = "udpEcho"
    id: str
    server: str
    client: str
    port: int = 9
    start: float = 1.0
    stop: float | None = None
    maxPackets: int = 100
    interval: float = 1.0
    packetSize: int = 64


class OnOffApp(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: Literal["onoff"] = "onoff"
    id: str
    fromNode: str = Field(alias="from")
    to: str
    port: int = 9000
    start: float = 1.0
    stop: float | None = None
    dataRate: str = "500kbps"
    packetSize: int = 512


class AodvDiscoverApp(BaseModel):
    """Triggers rpl::RplRoutingProtocol::DiscoverRoute() (RFC 9854) at runtime.

    A one-shot call, not a running application, so unlike the other App
    kinds it has no stop time.
    """

    model_config = ConfigDict(populate_by_name=True)

    type: Literal["aodvDiscover"] = "aodvDiscover"
    id: str
    fromNode: str = Field(alias="from")
    to: str
    start: float = 1.0


App = Annotated[
    Union[PingApp, UdpEchoApp, OnOffApp, AodvDiscoverApp], Field(discriminator="type")
]


class Simulation(BaseModel):
    duration: float = 100.0
    seed: int = 1
    # canvas px -> simulation metres
    scale: float = 1.0
    pcap: bool = False
    logComponents: list[str] = Field(default_factory=list)
    # Seconds between RPL routing table snapshots. 0 takes one at the end of
    # the run only, which is all the log used to carry. Ignored entirely
    # unless the scenario routes with RPL.
    rplTableInterval: float = 10.0


class Scenario(BaseModel):
    version: int = 1
    name: str = "scenario"
    simulation: Simulation = Field(default_factory=Simulation)
    nodes: list[Node] = Field(default_factory=list)
    networks: list[Network] = Field(default_factory=list)
    stack: StackConfig = Field(default_factory=StackConfig)
    apps: list[App] = Field(default_factory=list)

    def slug(self) -> str:
        """Filesystem/target-safe name: ns3edit-<lowercase-alnum-dashes>."""
        s = re.sub(r"[^a-z0-9]+", "-", self.name.lower()).strip("-") or "scenario"
        return f"ns3edit-{s}"

    def node_index(self, node_id: str) -> int:
        """Index of a node in the generated NodeContainer."""
        for i, n in enumerate(self.nodes):
            if n.id == node_id:
                return i
        raise KeyError(node_id)
