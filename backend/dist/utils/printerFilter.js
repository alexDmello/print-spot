"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIRTUAL_PORT_BLACKLIST = exports.VIRTUAL_DRIVER_BLACKLIST = void 0;
exports.isVirtualPrinter = isVirtualPrinter;
exports.VIRTUAL_DRIVER_BLACKLIST = [
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
exports.VIRTUAL_PORT_BLACKLIST = [
    'portprompt:',
    'nul:',
    'shrfax:',
];
function isVirtualPrinter(name, driver, port) {
    const n = (name || '').toLowerCase();
    const d = (driver || '').toLowerCase();
    const p = (port || '').toLowerCase();
    if (exports.VIRTUAL_DRIVER_BLACKLIST.some(b => n.includes(b) || d.includes(b))) {
        return true;
    }
    if (exports.VIRTUAL_PORT_BLACKLIST.some(bp => p.includes(bp)) || p.includes('onenote')) {
        return true;
    }
    return false;
}
