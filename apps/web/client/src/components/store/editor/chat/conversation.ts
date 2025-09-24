import { api } from '@/trpc/client';
import { type ChatConversation } from '@onlook/models';
import { makeAutoObservable } from 'mobx';
import { toast } from 'sonner';
import type { EditorEngine } from '../engine';

interface CurrentConversation extends ChatConversation {
    messageCount: number;
}

export class ConversationManager {
    current: CurrentConversation | null = null;
    conversations: ChatConversation[] = [];
    creatingConversation = false;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async applyConversations(conversations: ChatConversation[]) {
        this.conversations = conversations;
        if (conversations.length > 0 && conversations[0]) {
            const conversation = conversations[0];
            await this.selectConversation(conversation.id);
        } else {
            await this.startNewConversation();
        }
    }

    async getConversations(projectId: string): Promise<ChatConversation[]> {
        const res: ChatConversation[] | null = await this.getConversationsFromStorage(projectId);
        if (!res) {
            console.error('No conversations found');
            return [];
        }
        const conversations = res;

        const sorted = conversations.sort((a, b) => {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return sorted || [];
    }

    setConversationLength(length: number) {
        if (this.current) {
            this.current = {
                ...this.current,
                messageCount: length,
            };
        }
    }

    async startNewConversation() {
        try {
            this.creatingConversation = true;
            if (this.current?.messageCount === 0 && !this.current?.title) {
                throw new Error('Current conversation is already empty.');
            }
            const newConversation = await api.chat.conversation.upsert.mutate({
                projectId: this.editorEngine.projectId,
            });
            this.current = {
                ...newConversation,
                messageCount: 0,
            };
            this.conversations.push(newConversation);
        } catch (error) {
            console.error('Error starting new conversation', error);
            toast.error('Error starting new conversation.', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            this.creatingConversation = false;
        }
    }

    async selectConversation(id: string) {
        const match = this.conversations.find((c) => c.id === id);
        if (!match) {
            console.error('No conversation found with id', id);
            return;
        }

        this.current = {
            ...match,
            messageCount: 0,
        };
    }

    async deleteConversation(id: string): Promise<boolean> {
        if (!this.current) {
            console.error('No conversation found');
            return false;
        }

        const index = this.conversations.findIndex((c) => c.id === id);
        if (index === -1) {
            console.error('No conversation found with id', id);
            return false;
        }

        const [removed] = this.conversations.splice(index, 1);
        const wasCurrent = this.current?.id === id;

        try {
            await this.deleteConversationInStorage(id);
        } catch (error) {
            console.error('Error deleting conversation', error);
            toast.error('Error deleting conversation.', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
            if (removed) {
                this.conversations.splice(index, 0, removed);
            }
            return false;
        }

        if (wasCurrent) {
            if (this.conversations.length > 0 && this.conversations[0]) {
                await this.selectConversation(this.conversations[0].id);
            } else {
                await this.startNewConversation();
            }
        }

        return true;
    }

    async generateTitle(content: string): Promise<void> {
        if (!this.current) {
            console.error('No conversation found');
            return;
        }
        const title = await api.chat.conversation.generateTitle.mutate({
            projectId: this.editorEngine.projectId,
            conversationId: this.current?.id,
            content,
        });
        if (!title) {
            console.error('Error generating conversation title. No title returned.');
            return;
        }
        // Update local active conversation 
        this.current = {
            ...this.current,
            title,
        };
        // Update in local conversations list
        const index = this.conversations.findIndex((c) => c.id === this.current?.id);
        if (index !== -1 && this.conversations[index]) {
            this.conversations[index] = {
                ...this.conversations[index],
                title,
            };
        }
    }

    async getConversationsFromStorage(id: string): Promise<ChatConversation[] | null> {
        return api.chat.conversation.getAll.query({ projectId: id });
    }

    async updateConversationInStorage(conversation: Partial<ChatConversation> & { id: string }) {
        await api.chat.conversation.update.mutate({
            projectId: this.editorEngine.projectId,
            ...conversation,
        });
    }

    async deleteConversationInStorage(id: string) {
        await api.chat.conversation.delete.mutate({
            projectId: this.editorEngine.projectId,
            conversationId: id,
        });
    }

    clear() {
        this.current = null;
        this.conversations = [];
    }
}
