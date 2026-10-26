function fmtAmt(value, code) {
  code = code || 'INR';
  if (value === null || value === undefined) return null;
  var num = Number(value);
  if (isNaN(num)) return null;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(num);
  } catch(e) { return String(num); }
}

export function CountrySubtotalRow({ countryConfig, reportingCurrencyCode, snapshotPayload }) {
  reportingCurrencyCode = reportingCurrencyCode || 'INR';
  snapshotPayload = snapshotPayload || null;
  var allProducts = (snapshotPayload && snapshotPayload.products) ? snapshotPayload.products : [];
  var countryCurrency = (countryConfig.currency || '').toUpperCase();
  var products = allProducts.filter(function(p) {
    if (!p.native_currency_code) return true;
    return p.native_currency_code.toUpperCase() === countryCurrency;
  });
  if (products.length === 0 && allProducts.length > 0) {
    products = allProducts;
  }
  var subTotal = products.length > 0
    ? products.reduce(function(acc, p) { return acc + (p.subscription_total_after_discount || 0) * (p.fx_rate_multiplier || 1); }, 0)
    : null;
  var srvTotal = products.length > 0
    ? products.reduce(function(acc, p) { return acc + (p.service_total_after_discount || 0) * (p.fx_rate_multiplier || 1); }, 0)
    : null;
  var total = subTotal !== null ? subTotal + (srvTotal || 0) : null;
  var licenseFee = subTotal !== null ? fmtAmt(subTotal, reportingCurrencyCode) : 'Pending backend calculation';
  var serviceFees = srvTotal !== null ? fmtAmt(srvTotal, reportingCurrencyCode) : 'Pending backend calculation';
  var totalFmt = total !== null ? fmtAmt(total, reportingCurrencyCode) : 'Pending backend calculation';

  return (
    <tr className="bg-slate-100/80 font-semibold text-xs border-t border-b-2 border-slate-300 text-slate-800">
      <td className="py-3 px-4">
        <div className="flex items-center justify-between">
          <span>Subtotal &mdash; {countryConfig.countryName}</span>
          <span className="text-[10px] font-mono text-slate-500 uppercase">({reportingCurrencyCode})</span>
        </div>
      </td>
      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-600">{licenseFee}</td>
      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-600">{totalFmt}</td>
      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-600">{serviceFees}</td>
      <td className="py-3 px-3 text-right font-mono text-xs font-bold text-slate-900">{totalFmt}</td>
      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-600 italic">&mdash;</td>
    </tr>
  )
}

export default CountrySubtotalRow
