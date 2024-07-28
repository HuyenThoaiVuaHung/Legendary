import { LogHelper } from './../../misc/log.helper.ts';
import { AuthenticationService } from "../../authentication/auth.service.ts";
import { NetworkService } from './../network.service.ts';
import { Socket } from 'socket.io';


export function initializeDefaultNamespace(networkService: NetworkService, authService: AuthenticationService) {
    const defaultNamespace = networkService.io;
    defaultNamespace.use(handshakeMiddleware);
    defaultNamespace.on("connection", (socket) => {
        initializeAuthListeners(socket);
        LogHelper.log("A user connected at " + socket.handshake.time);
    });

    function initializeAuthListeners(socket: Socket) {
        socket.on("authenticate", (authHash: string) => {
          authService.authenticate(authHash);
        });
        socket.on("deauthenticate", (authHash: string) => {
          authService.deauthenticate(authHash);
        });
      }
    
}
function handshakeMiddleware(socket: Socket, next: (err?: any) => void) {
    next();
  }
  