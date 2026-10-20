export function CountrySubtotalRow({
  countryConfig,
  reportingCurrency,
  calculationResult,
}) {
  const countryCalc =
    calculationResult?.countryBreakdowns?.[countryConfig.countryId] ||
    calculationResult?.countryBreakdowns?.[countryConfig.id] ||
    null

  const licenseFee = countryCalc?.licenseFee || 'Pending backend calculation'
  const pepm = countryCalc?.pepm || 'Pending backend calculation'
  const serviceFees = countryCalc?.serviceFees || 'Pending backend calculation'
  const total = countryCalc?.total || 'Pending backend calculation'
  const grossMargin = countryCalc?.grossMargin
    ? `${countryCalc.grossMargin}%`
    : 'Pending backend calculation'

  return (
    <tr className="bg-slate-100/80 font-semibold text-xs border-t border-b-2 border-slate-300 text-slate-800">
      <td className="py-3 px-4">
        <div className="flex items-center justify-between">
          <span>Subtotal — {countryConfig.countryName}</span>
          <span className="text-[10px] font-mono text-slate-500 uppercase">
            ({reportingCurrency})
          </span>
        </div>
      </td>
      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-600 italic">
        {licenseFee}
      </td>
      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-600 italic">
        {pepm}
      </td>
      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-600 italic">
        {serviceFees}
      </td>
      <td className="py-3 px-3 text-right font-mono text-xs font-bold text-slate-900 italic">
        {total}
      </td>
      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-600 italic">
        {grossMargin}
      </td>
    </tr>
  )
}

export default CountrySubtotalRow
