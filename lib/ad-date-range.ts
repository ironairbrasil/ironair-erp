export function adDateRange(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = params.get('from');
  const to = params.get('to');
  if (!from && !to) return null;
  const valid = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
  if (!valid(from) || !valid(to) || from! > to!) throw new Error('Período inválido');
  return { from: from!, to: to!, start: new Date(`${from}T00:00:00.000Z`), end: new Date(`${to}T23:59:59.999Z`) };
}
