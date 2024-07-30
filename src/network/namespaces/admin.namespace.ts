import { Role } from "../../authentication/auth.interface.ts";
import { AuthenticationService } from "../../authentication/auth.service.ts";
import { sha256 } from "../../helpers/crypto.helper.ts";
import { NetworkService } from './../network.service.ts';
import { ExtendedError, Socket } from "npm:socket.io@^4.4.0";

export function initializeAdminNamespace(networkService: NetworkService, authService: AuthenticationService) {
    const adminNamespace = networkService.io.of("/admin");
    adminNamespace.use(authMiddleware);
    adminNamespace.on("connection", (socket: Socket) => {
        console.log("Admin connected");
    });
    
    function authMiddleware(socket: Socket, next: (err?: ExtendedError) => void) {
        sha256(socket.handshake.auth.authId).then(
            (hash) => {
                if (authService.authenticate(hash).role === Role.ADMIN){
                    next();
                }
                else {
                    next(new Error("Unauthorized"));
                }
            }
        )
    }
}