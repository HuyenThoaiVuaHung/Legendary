import { AuthenticationService } from "./src/authentication/auth.service.ts";
import { StateService } from "./src/state/state.service.ts";
import { NetworkService } from "./src/network/network.service.ts";




async function start(){
    const stateService = new StateService();
    const authService = new AuthenticationService(stateService);
    const networkService = new NetworkService(stateService, authService);
}
start();