import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-insecure-secret-change-me"
);

export type JwtPayload = {
  sub: string; // identityId
  email: string;
  name: string;
  globalRole: string;
};

export async function signUserToken(payload: JwtPayload, expiresIn = "12h") {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyUserToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret);
  return {
    sub: String(payload.sub),
    email: String(payload.email ?? ""),
    name: String(payload.name ?? ""),
    globalRole: String(payload.globalRole ?? "user"),
  };
}
