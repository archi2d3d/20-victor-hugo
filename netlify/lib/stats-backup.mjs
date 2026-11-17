import {randomBytes,createCipheriv,createDecipheriv,scryptSync,createHash} from 'node:crypto';
export const digest=data=>createHash('sha256').update(data).digest('hex');
export function encryptSnapshot(snapshot,password){
 if(typeof password!=='string'||password.length<24)throw new Error('Backup password must contain at least 24 characters');
 const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',scryptSync(password,salt,32),iv);
 const data=Buffer.concat([cipher.update(JSON.stringify(snapshot),'utf8'),cipher.final()]);
 return Buffer.concat([Buffer.from('VHBACKUP1'),salt,iv,cipher.getAuthTag(),data]);
}
export function decryptSnapshot(data,password){
 if(data.subarray(0,9).toString()!=='VHBACKUP1')throw new Error('Invalid backup');
 const decipher=createDecipheriv('aes-256-gcm',scryptSync(password,data.subarray(9,25),32),data.subarray(25,37));
 decipher.setAuthTag(data.subarray(37,53));
 return JSON.parse(Buffer.concat([decipher.update(data.subarray(53)),decipher.final()]).toString());
}
