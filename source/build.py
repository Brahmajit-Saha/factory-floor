t=open('src/template.html').read()
t=t.replace('@@SCREENS@@',open('src/screens.html').read())
for k,f in [('GEN','gen'),('LOGIC','logic'),('RENDER','render'),('APP','app'),('STORE','store'),('GAME','game'),('XLSX','xlsx'),('VIEW','view'),('SHELL','shell')]:
    t=t.replace('/*%s*/'%k,open('src/%s.js'%f).read())
t=t.replace('/*SUPABASE*/',open('assets/supabase.umd.js').read())
import os,base64
def b64(path,mime):
    return 'data:'+mime+';base64,'+base64.b64encode(open(path,'rb').read()).decode()
t=t.replace('@@LOGO_CLUB@@',b64('assets/logo-club.png','image/png')).replace('@@LOGO_COLLEGE@@',b64('assets/logo-college.png','image/png'))
for k,f in [('CP500','chakra-petch-latin-500'),('CP600','chakra-petch-latin-600'),('CP700','chakra-petch-latin-700'),('JB500','jetbrains-mono-latin-500'),('JB700','jetbrains-mono-latin-700'),('IN400','inter-latin-400'),('IN500','inter-latin-500'),('IN600','inter-latin-600'),('IN700','inter-latin-700')]:
    t=t.replace('@@F_%s@@'%k,b64('assets/fonts/%s-normal.woff2'%f,'font/woff2'))
os.makedirs('dist',exist_ok=True)
open('dist/index.html','w').write(t)
print(len(t))
