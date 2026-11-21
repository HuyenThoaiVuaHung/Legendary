import { ipKeyGenerator } from 'express-rate-limit';
import { IncomingMessage } from 'http';
import proxyaddr from 'proxy-addr';
import { ServerConfig } from '../config';

const IPV6_SUBNET = 56;

/** Resolve the client address using the configured trusted proxies. */
export function createClientIp(trustProxy: ServerConfig['trustProxy']): (req: IncomingMessage) => string {
  let trust: (addr: string, i: number) => boolean;
  if (trustProxy === false) {
    trust = () => false;
  } else if (typeof trustProxy === 'number') {
    trust = (_addr, i) => i < trustProxy;
  } else {
    trust = proxyaddr.compile(trustProxy.split(',').map((address) => address.trim()));
  }
  return (req) => proxyaddr(req, trust);
}

/** Group IPv6 addresses in the same subnet as the HTTP rate limiters. */
export function ipBucket(ip: string): string {
  return ipKeyGenerator(ip, IPV6_SUBNET);
}
