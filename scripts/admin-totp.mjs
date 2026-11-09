import { randomBytes } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function encode(bytes) {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

const secret = encode(randomBytes(20));
const label = process.env.ADMIN_EMAIL || "admin";
const issuer = "CaluServers";
const url = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
console.log("ADMIN_TOTP_SECRET=" + secret);
console.log(url);
console.log("Add the secret to the server environment and restart. Leave it unset to keep MFA off.");
