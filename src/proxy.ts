export { auth as proxy } from "@/lib/edge-auth";

export const config = {
  matcher: ["/dashboard/:path*"],
};
