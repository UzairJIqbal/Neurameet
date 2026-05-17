/* eslint-disable prettier/prettier */
"use server";

import { currentUser } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secretKey = process.env.STREAM_SECRET_KEY;

export const tokenProvider = async () => {
	const user = await currentUser();
	if (!apiKey) throw new Error("API Key error");
	if (!secretKey) throw new Error("Secret Key error");
	if (!user) throw new Error("User not foud");

	const client = new StreamClient(apiKey, secretKey);
	const expDate = Math.floor(Date.now() / 1000) + 60 * 60;
	const issued = Math.round(new Date().getDate() / 1000) - 60;

	const token = client.generateUserToken({
		user_id: user?.id,
		exp: expDate,
		tokenIssued: issued,
	});
	return token;
};
