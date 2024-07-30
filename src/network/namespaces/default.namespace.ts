import { LogHelper } from "../../helpers/log.helper.ts";
import { AuthenticationService } from "../../authentication/auth.service.ts";
import { NetworkService } from "./../network.service.ts";
import { Socket } from "socket.io";
import { version } from "../../../environment.ts";
import { ExtendedError } from "npm:socket.io@^4.4.0";
import { sha256 } from "../../helpers/crypto.helper.ts";

export function initializeDefaultNamespace(
  networkService: NetworkService,
  authService: AuthenticationService
) {
  const defaultNamespace = networkService.io;
  defaultNamespace.use(handshakeMiddleware);
  defaultNamespace.on("connection", (socket) => {
    initializeAuthListeners(socket);
    LogHelper.log("A user connected at " + socket.handshake.time);
  });

  function initializeAuthListeners(socket: Socket) {
    socket.on("authenticate", async (authId: string) => {
      authService.authenticate(await sha256(authId));
    });
    socket.on("deauthenticate", async (authId: string) => {
      authService.deauthenticate(await sha256(authId));
    });
  }
}
function handshakeMiddleware(
  _socket: Socket,
  next: (err?: ExtendedError) => void
) {
  next();
  // if (socket.handshake.auth.version === version) next();
  // else {
  //   LogHelper.warn("Version mismatch, closing connection");
  //   next(new Error("Version mismatch"));
  // }
}
