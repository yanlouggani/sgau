import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROLE_ROUTES: Record<string, string[]> = {
  admin: ["/dashboard", "/admin", "/payments", "/modules", "/groups", "/rooms", "/schedule", "/students", "/professors", "/enrollments", "/domains", "/sections", "/users", "/profile"],
  secretary: ["/secretary", "/dashboard", "/payments", "/students", "/groups", "/enrollments", "/schedule", "/rooms", "/profile"],
  professor: ["/professor", "/profile"],
  student: ["/student", "/profile"],
};

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isPublicPage =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/login");

  if (!user && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const dashboard = profile?.role === "admin" ? "/dashboard" : profile?.role === "secretary" ? "/secretary/dashboard" : profile?.role === "professor" ? "/professor/dashboard" : "/student/dashboard";
    return NextResponse.redirect(new URL(dashboard, request.url));
  }

  if (user && !isPublicPage) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const path = request.nextUrl.pathname;
    const allowedRoutes = profile ? ROLE_ROUTES[profile.role] ?? [] : [];

    const isAllowed = allowedRoutes.some((prefix) => path === prefix || path.startsWith(prefix + "/"));

    if (!isAllowed) {
      const dashboard = profile?.role === "admin" ? "/dashboard" : profile?.role === "secretary" ? "/secretary/dashboard" : profile?.role === "professor" ? "/professor/dashboard" : "/student/dashboard";
      return NextResponse.redirect(new URL(dashboard, request.url));
    }
  }

  return supabaseResponse;
}
