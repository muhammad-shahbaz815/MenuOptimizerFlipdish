import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { D1Adapter } from '@/lib/d1-adapter';

const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.NEXTNEXTAUTH_SECRET;

const authConfig = NextAuth({
  adapter: D1Adapter(),
  secret: authSecret,
  trustHost: true,
  basePath: '/api/auth',
  session: { strategy: 'jwt' },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          scope: 'openid email profile',
        },
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = (token.sub ?? '') as string;
      }
      return session;
    },
    jwt: async ({ token, user }) => {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
  },
});

export const { handlers, auth, signIn, signOut } = authConfig;
export const { GET, POST } = handlers;
