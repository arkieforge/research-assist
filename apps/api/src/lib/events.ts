/** Messages on the ChatEvents queue. The ChatAgent produces them; src/worker.ts `queue` consumes them. */
export type ChatEvent = {
	type: "chat.updated";
	/** ChatAgent instance name (see chat-name.ts). */
	chatId: string;
	userId: string;
	title: string;
	/** Epoch ms of the turn that produced the event; the newest wins on replay. */
	at: number;
};
