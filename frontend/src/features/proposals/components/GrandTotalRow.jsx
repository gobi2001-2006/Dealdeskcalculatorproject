export function GrandTotalRow({
  reportingCurrency,
  calculationResult,
}) {
  const licenseFee = calculationResult?.licenseFees || 'Pending backend calculation'
  const pepm = calculationResult?.pepmTotal || 'Pending backend calculation'
  const serviceFees = calculationResult?.serviceFees || 'Pending backend calculation'
  const grandTotal = calculationResult?.grandTotal || 'Pending backend calculation'
  const grossMargin = calculationResult?.grossMargin
    ? `${calculationResult.grossMargin}%`
    : 'Pending backend calculation'

  return (
    <tr className="bg-[#0B1528] text-white font-bold text-xs border-t-2 border-orange-500 shadow-sm">
      <td className="py-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm tracking-wide text-white font-bold">
            Grand Total
          </span>
          <span className="text-[11px] font-mono text-orange-400 font-semibold">
            ({reportingCurrency})
          </span>
        </div>
      </td>
      <td className="py-4 px-3 text-right font-mono text-xs text-slate-300 italic">
        {licenseFee}
      </td>
      <td className="py-4 px-3 text-right font-mono text-xs text-slate-300 italic">
        {pepm}
      </td>
      <td className="py-4 px-3 text-right font-mono text-xs text-slate-300 italic">
        {serviceFees}
      </td>
      <td className="py-4 px-3 text-right font-mono text-sm font-bold text-orange-400 italic">
        {grandTotal}
      </td>
      <td className="py-4 px-3 text-right font-mono text-xs text-slate-300 italic">
        {grossMargin}
      </td>
    </tr>
  )
}

export default GrandTotalRow
