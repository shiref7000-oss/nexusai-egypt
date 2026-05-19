#!/usr/bin/env node
/**
 * Patches production Vite bundle for AppLayout me->e bug and Radix Select empty values.
 * Usage: node patch-production-bundle.mjs path/to/index-*.js
 */
import { readFileSync, writeFileSync } from 'fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node patch-production-bundle.mjs <bundle.js>');
  process.exit(1);
}

let s = readFileSync(file, 'utf8');
const before = (s.match(/me\?\./g) || []).length;

s = s.replace(/children:me\?\.plan/g, 'children:e?.plan');
s = s.replace(
  /children:me\?\.email\?\.\[0\]\?\.toUpperCase\(\)/g,
  'children:e?.email?.[0]?.toUpperCase()'
);
s = s.replace(
  /children:me\?\.fullName\|\|me\?\.email\|\|"User"/g,
  'children:e?.name||e?.email||"User"'
);
s = s.replace(/truncate",children:me\?\.email/g, 'truncate",children:e?.email');
s = s.replace(/f\.jsx\(Tt,\{value:"",children:"All Roles"\}\)/g, 'f.jsx(Tt,{value:"all",children:"All Roles"})');
s = s.replace(/f\.jsx\(Tt,\{value:"",children:"All Status"\}\)/g, 'f.jsx(Tt,{value:"all",children:"All Status"})');
s = s.replace(
  'Zn.users({page:i,limit:E,search:c,role:h,status:v})',
  'Zn.users({page:i,limit:E,search:c,role:h&&h!=="all"?h:"",status:v&&v!=="all"?v:""})'
);

writeFileSync(file, s);
const after = (s.match(/me\?\./g) || []).length;
console.log(`Patched ${file}: me?. ${before} -> ${after} (remaining may be in strings)`);
