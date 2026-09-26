export const VIRTUAL_DRIVER_BLACKLIST = [
  'microsoft print to pdf',
  'microsoft xps document writer',
  'onenote',
  'send to microsoft onenote',
  'fax',
  'microsoft shared fax driver',
  'microsoft software printer driver',
  'cutepdf',
  'acrobat distiller',
  'adobe pdf',
  'foxit reader pdf printer',
  'bullzip pdf',
  'pdfcreator',
  'cute pdf',
];

export const VIRTUAL_PORT_BLACKLIST = [
  'portprompt:',
  'nul:',
  'shrfax:',
];

export function isVirtualPrinter(name?: string, driver?: string, port?: string): boolean {
  const n = (name || '').toLowerCase();
  const d = (driver || '').toLowerCase();
  const p = (port || '').toLowerCase();

  if (VIRTUAL_DRIVER_BLACKLIST.some(b => n.includes(b) || d.includes(b))) {
    return true;
  }

  if (VIRTUAL_PORT_BLACKLIST.some(bp => p.includes(bp)) || p.includes('onenote')) {
    return true;
  }

  return false;
}
