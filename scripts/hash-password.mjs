import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
const rl=createInterface({input:process.stdin,output:process.stdout});
const pass=await rl.question('Admin password (input visible): ');
rl.close();
if(pass.length<14) {console.error('Use at least 14 characters.');process.exit(1)}
const salt=randomBytes(16).toString('hex');
console.log('ADMIN_PASSWORD_HASH='+salt+':'+scryptSync(pass,Buffer.from(salt,'hex'),64).toString('hex'));
