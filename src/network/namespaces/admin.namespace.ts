import { Server } from "npm:socket.io@^4.4.0";

export function initializeAdminNamespace(io: Server){
    const adminNamespace = io.of("/admin");
    adminNamespace.use((socket, next) => {
        
    });
    adminNamespace.on("connection", (socket) => {
        console.log("Admin connected");
    });

}