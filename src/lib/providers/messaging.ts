export interface MessagingProvider {
 createInstance(instanceName:string):Promise<unknown>;
 getInstanceStatus(instanceName:string):Promise<unknown>;
 getQRCode(instanceName:string):Promise<unknown>;
 sendText(instanceName:string,number:string,text:string):Promise<unknown>;
 logout(instanceName:string):Promise<unknown>;
}
