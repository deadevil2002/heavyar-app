export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  console.log('Redirect system path:', path, initial);
  return '/';
}
