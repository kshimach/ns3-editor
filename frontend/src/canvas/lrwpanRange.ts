/**
 * Approximate LR-WPAN communication range, for the canvas overlay only --
 * this plays no part in what actually gets simulated.
 *
 * Nothing in the editor exposes TX power, RX sensitivity, or the loss
 * models' frequency/exponent, so the generated code runs on ns-3's own
 * defaults for all of them, and that is what this mirrors rather than an
 * independently chosen number:
 *
 *   - TX power 0 dBm and RX sensitivity -106.58 dBm:
 *     src/lr-wpan/model/lr-wpan-phy.cc, LrWpanPhy's constructor
 *     (`SetRxSensitivity(-106.58)`) and `m_phyPIBAttributes.phyTransmitPower
 *     = 0`, which `GetNominalTxPowerFromPib()` reads back as 0 dBm.
 *   - LogDistancePropagationLossModel: exponent 3.0, reference loss
 *     46.6777 dB at 1 m (src/propagation/model/propagation-loss-model.cc).
 *   - FriisPropagationLossModel: frequency 5.15 GHz, the ns-3 default for
 *     that model specifically -- not 802.15.4's actual 2.4 GHz band, since
 *     the generated code (templates/scenario.cc.j2) does not override it.
 *
 * The result is the distance at which received power drops to the RX
 * sensitivity threshold. Actual delivery also depends on the LQI-driven
 * error model when one is attached, so this is a rough edge to plan node
 * placement around, not a hard cutoff the simulation itself enforces.
 */

export type LrWpanLossModel = "logDistance" | "friis";

const TX_POWER_DBM = 0;
const RX_SENSITIVITY_DBM = -106.58;
const SPEED_OF_LIGHT_M_S = 299792458;

const LOG_DISTANCE_EXPONENT = 3.0;
const LOG_DISTANCE_REFERENCE_LOSS_DB = 46.6777; // at the 1 m reference distance
const FRIIS_FREQUENCY_HZ = 5.15e9;

/**
 * @param lossModel `Network["lrwpan"]["lossModel"]` -- typed as a plain
 *   string on the scenario (it round-trips through a <select> value), not
 *   the two-member union this actually only ever holds. Anything other than
 *   "friis" is treated as "logDistance", the codegen's own default and the
 *   only other option Properties.tsx's dropdown offers.
 */
export function lrWpanRangeMeters(lossModel: string): number {
  const margin = TX_POWER_DBM - RX_SENSITIVITY_DBM; // link budget, in dB
  const friis: LrWpanLossModel = "friis";

  if (lossModel === friis) {
    // rx = tx + 20*log10(lambda / (4*pi*d))  =>  d = lambda/(4*pi) * 10^(margin/20)
    const lambda = SPEED_OF_LIGHT_M_S / FRIIS_FREQUENCY_HZ;
    return (lambda / (4 * Math.PI)) * 10 ** (margin / 20);
  }

  // rx = tx - referenceLoss - 10*n*log10(d)  =>  d = 10^((margin - referenceLoss) / (10*n))
  return 10 ** ((margin - LOG_DISTANCE_REFERENCE_LOSS_DB) / (10 * LOG_DISTANCE_EXPONENT));
}
