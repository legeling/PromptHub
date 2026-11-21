export function validVersionFile(name: string): boolean {
  return /^(?:0|[1-9]\d{0,15})-[0-9a-f]{64}\.json$/.test(name);
}

export function parseHistoryListing(xml: string, folder: string): string[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.documentElement.localName !== "multistatus")
    throw new Error("Invalid WebDAV directory listing");
  const base = new URL(folder);
  const names = new Set<string>();
  for (const href of document.getElementsByTagNameNS("DAV:", "href")) {
    const url = new URL(href.textContent || "", base);
    const name = url.pathname.substring(base.pathname.length);
    if (
      url.origin === base.origin &&
      url.pathname.startsWith(base.pathname) &&
      validVersionFile(name)
    )
      names.add(name);
  }
  return [...names].sort().reverse();
}
