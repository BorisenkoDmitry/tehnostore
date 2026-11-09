const fs=require('node:fs'),crypto=require('node:crypto')
if(fs.existsSync('.env'))throw Error('Refusing to overwrite .env')
fs.writeFileSync('.env',['POSTGRES_BOOTSTRAP_PASSWORD','MEDUSA_DB_PASSWORD','JWT_SECRET','COOKIE_SECRET'].map(k=>k+'='+crypto.randomBytes(32).toString('hex')).join('\n')+'\nNEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=\nNEXT_PUBLIC_DEFAULT_REGION=ru\n',{mode:0o600})
console.log('Generated independent local secrets in .env')
