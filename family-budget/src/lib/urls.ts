/** Keep email callbacks inside this deployment, including GitHub project pages. */
export function appUrl(
  origin = window.location.origin,
  base = import.meta.env.BASE_URL,
): string {
  return new URL(base, origin).href;
}
