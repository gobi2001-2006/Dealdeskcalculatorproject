function fmtAmt(value, code) {
  code = code || 'INR';
  if (value === null || value === undefined) return null;
  var num = Number(value);
  if (isNaN(num)) return null;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(num);
  } catch(e) { return String(num); }
}

export function GrandTotalRow({ reportingCurrencyCode, snapshotPayload }) {
  reportingCurrencyCode = reportingCurrencyCode || 'INR';
  snapshotPayload = snapshotPayload || null;
  var products = (snapshotPayload && snapshotPayload.products) ? snapshotPayload.products : [];
  var subTotal = products.length > 0
    ? products.reduce(function(acc, p) { return acc + (p.subscription_total_after_discount || 0) * (p.fx_rate_multiplier || 1); }, 0)
    : null;
  var srvTotal = products.length > 0
    ? products.reduce(function(acc, p) { return acc + (p.service_total_after_discount || 0) * (p.fx_rate_multiplier || 1); }, 0)
    : null;
  var grandTotalRaw = snapshotPayload ? snapshotPayload.total_proposal_reporting_currency : null;
  var licenseFee = subTotal !== null ? fmtAmt(subTotal, reportingCurrencyCode) : 'Pending backend calculation';
  var serviceFees = srvTotal !== null ? fmtAmt(srvTotal, reportingCurrencyCode) : 'Pending backend calculation';
  var grandTotalFmt = grandTotalRaw !== null && grandTotalRaw !== undefined ? fmtAmt(grandTotalRaw, reportingCurrencyCode) : 'Pending backend calculation';

  return (
    <tr className="bg-[#0B1528] text-white font-bold text-xs border-t-2 border-orange-500 shadow-sm">
      <td className="py-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm tracking-wide text-white font-bold">Grand Total</span>
          <span className="text-[11px] font-mono text-orange-400 font-semibold">({reportingCurrencyCode})</span>
        </div>
      </td>
      <td className="py-4 px-3 text-right font-mono text-xs text-slate-300">{licenseFee}</td>
      <td className="py-4 px-3 text-right font-mono text-xs text-slate-300">{grandTotalFmt}</td>
      <td className="py-4 px-3 text-right font-mono text-xs text-slate-300">{serviceFees}</td>
      <td className="py-4 px-3 text-right font-mono text-sm font-bold text-orange-400">{grandTotalFmt}</td>
      <td className="py-4 px-3 text-right font-mono text-xs text-slate-300 italic">&mdash;</td>
    </tr>
  )
}

export default GrandTotalRow
