export function localRequestAllowed(host:string,origin:string|undefined,site:string|undefined,api:boolean,port:number){
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return false;
 return !api||(!origin||['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin))&&site!=='cross-site';
}
