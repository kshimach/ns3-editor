/**
 * Approximate radio range, for the canvas overlay only -- this plays no
 * part in what actually gets simulated.
 *
 * Nothing in the editor exposes TX power, RX sensitivity, or the loss
 * models' frequency/exponent for either radio type, so the generated code
 * runs on ns-3's own defaults for all of them, and that is what each
 * function below mirrors rather than an independently chosen number. The
 * result is the distance at which received power drops to the PHY's RX
 * threshold; actual delivery also depends on things this does not model
 * (LR-WPAN's LQI-driven error model, WiFi's SNR-relative preamble
 * threshold), so this is a rough edge to plan node placement around, not a
 * hard cutoff the simulation itself enforces.
 */

const SPEED_OF_LIGHT_M_S = 299792458;

// Both radios that use LogDistancePropagationLossModel in the generated code
// (templates/scenario.cc.j2) do so without touching its attributes, so both
// share these same ns-3 defaults (src/propagation/model/propagation-loss-model.cc).
const LOG_DISTANCE_EXPONENT = 3.0;
const LOG_DISTANCE_REFERENCE_LOSS_DB = 46.6777; // at the 1 m reference distance

function logDistanceRangeMeters(marginDb: number): number {
  // rx = tx - referenceLoss - 10*n*log10(d)  =>  d = 10^((margin - referenceLoss) / (10*n))
  return 10 ** ((marginDb - LOG_DISTANCE_REFERENCE_LOSS_DB) / (10 * LOG_DISTANCE_EXPONENT));
}

function friisRangeMeters(marginDb: number, frequencyHz: number): number {
  // rx = tx + 20*log10(lambda / (4*pi*d))  =>  d = lambda/(4*pi) * 10^(margin/20)
  const lambda = SPEED_OF_LIGHT_M_S / frequencyHz;
  return (lambda / (4 * Math.PI)) * 10 ** (marginDb / 20);
}

// --- LR-WPAN ---
//
//   - TX power 0 dBm and RX sensitivity -106.58 dBm:
//     src/lr-wpan/model/lr-wpan-phy.cc, LrWpanPhy's constructor
//     (`SetRxSensitivity(-106.58)`) and `m_phyPIBAttributes.phyTransmitPower
//     = 0`, which `GetNominalTxPowerFromPib()` reads back as 0 dBm.
//   - FriisPropagationLossModel: frequency 5.15 GHz, the ns-3 default for
//     that model specifically -- not 802.15.4's actual 2.4 GHz band, since
//     the generated code does not override it.

export type LrWpanLossModel = "logDistance" | "friis";

const LRWPAN_TX_POWER_DBM = 0;
const LRWPAN_RX_SENSITIVITY_DBM = -106.58;
const FRIIS_FREQUENCY_HZ = 5.15e9;

/**
 * @param lossModel `Network["lrwpan"]["lossModel"]` -- typed as a plain
 *   string on the scenario (it round-trips through a <select> value), not
 *   the two-member union this actually only ever holds. Anything other than
 *   "friis" is treated as "logDistance", the codegen's own default and the
 *   only other option Properties.tsx's dropdown offers.
 */
export function lrWpanRangeMeters(lossModel: string): number {
  const margin = LRWPAN_TX_POWER_DBM - LRWPAN_RX_SENSITIVITY_DBM; // link budget, in dB
  const friis: LrWpanLossModel = "friis";
  if (lossModel === friis) {
    return friisRangeMeters(margin, FRIIS_FREQUENCY_HZ);
  }
  return logDistanceRangeMeters(margin);
}

// --- WiFi ---
//
// Both wifiAdhoc and wifiInfra install through the same
// YansWifiChannelHelper::Default() / WifiPhyHelper path (templates/
// scenario.cc.j2), which neither the editor nor the generated code
// overrides regardless of which 802.11 standard is selected, so this one
// number covers both network types and every standard:
//
//   - TX power 16.0206 dBm: WifiPhy's "TxPowerStart"/"TxPowerEnd" defaults
//     (src/wifi/model/wifi-phy.cc).
//   - RX threshold -82 dBm: ThresholdPreambleDetectionModel's "MinimumRssi"
//     default (src/wifi/model/threshold-preamble-detection-model.cc), wired
//     in as WifiPhyHelper's own default preamble detection model
//     (src/wifi/helper/wifi-helper.cc). The model also has an SNR-relative
//     "Threshold" (4 dB over the noise floor), which this does not account
//     for -- at ordinary indoor/urban noise levels it is not the binding
//     constraint next to a fixed -82 dBm floor, but it means an especially
//     noisy channel could fail to receive somewhat inside this ring too.
//   - LogDistancePropagationLossModel at its own defaults, same as above.
//
// This lands the same edge already documented in this project's README
// ("約50mを超えると受信不可") without repeating that as a separately
// maintained number.

const WIFI_TX_POWER_DBM = 16.0206;
const WIFI_RX_SENSITIVITY_DBM = -82;

export function wifiRangeMeters(): number {
  return logDistanceRangeMeters(WIFI_TX_POWER_DBM - WIFI_RX_SENSITIVITY_DBM);
}
