export function ysoRole(
  department:
    | {
        name: string
        officeCategory?: string | null
        layer: { number: number }
      }
    | null
    | undefined
): 'YSO' | 'AD' | null {
  if (department?.layer.number === 4 && department.name.toUpperCase() === 'YSO')
    return 'YSO'
  if (
    department?.layer.number === 3 &&
    department.officeCategory === 'PROVINCIAL'
  )
    return 'AD'
  return null
}
