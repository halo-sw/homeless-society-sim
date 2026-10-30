import { createRelay } from "./handler.js";

const relay = createRelay({ env: process.env });

export default function handler(req, res) {
  return relay(req, res);
}
