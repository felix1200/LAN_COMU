// ABOUTME: 会话路由：私聊/群聊创建、成员管理、消息分页与发送、已读上报

import { Router } from 'express';
import { authRequired } from '../auth';
import { execute, query, queryOne } from '../db';
import { sendToConversation, sendToUser } from '../hub';
import {
  directKey,
  getConversationBasic,
  getConversationFor,
  listConversationsFor,
  listMembers,
  notifyMembersChanged,
  pushConversationToMembers,
} from '../services/conversations';
import { createMessage, isMember, listMessages, markRead, searchMessages, type MessageType } from '../services/messages';
import { ah, HttpError, requireId, requireIdArray, requireString } from '../util';

const router = Router();

const MESSAGE_TYPES: MessageType[] = ['text', 'file'];

async function requireApprovedUsers(userIds: number[]): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await query<{ id: number }>(
    `SELECT id FROM users WHERE status = 'approved' AND id IN (${placeholders})`,
    userIds,
  );
  if (rows.length !== userIds.length) {
    throw new HttpError(400, '成员列表中存在无效或未审核的用户');
  }
}

async function requireMembership(conversationId: number, userId: number): Promise<void> {
  if (!(await isMember(conversationId, userId))) {
    throw new HttpError(403, '你不在该会话中');
  }
}

// 我的会话列表
router.get('/conversations', authRequired, ah(async (req, res) => {
  res.json({ conversations: await listConversationsFor(req.user!.id) });
}));

// 发起/获取私聊
router.post('/conversations/direct', authRequired, ah(async (req, res) => {
  const me = req.user!;
  const targetId = requireId(req.body?.userId, '用户');
  if (targetId === me.id) {
    throw new HttpError(400, '不能与自己发起私聊');
  }
  const target = await queryOne<{ id: number; status: string }>('SELECT id, status FROM users WHERE id = ?', [targetId]);
  if (!target || target.status !== 'approved') {
    throw new HttpError(404, '用户不存在或未通过审核');
  }

  const key = directKey(me.id, targetId);
  const existing = await queryOne<{ id: number }>('SELECT id FROM conversations WHERE direct_key = ?', [key]);
  if (existing) {
    res.json({ conversation: await getConversationFor(Number(existing.id), me.id) });
    return;
  }

  const { insertId } = await execute(
    "INSERT INTO conversations (type, direct_key, creator_id) VALUES ('direct', ?, ?)",
    [key, me.id],
  );
  await execute('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)', [
    insertId,
    me.id,
    insertId,
    targetId,
  ]);
  await pushConversationToMembers(insertId, [me.id, targetId], 'conversation:new');
  res.status(201).json({ conversation: await getConversationFor(insertId, me.id) });
}));

// 创建群聊
router.post('/conversations/group', authRequired, ah(async (req, res) => {
  const me = req.user!;
  const name = requireString(req.body?.name, '群名称', 64);
  const memberIds = requireIdArray(req.body?.memberIds, '成员').filter((id) => id !== me.id);
  await requireApprovedUsers(memberIds);

  const { insertId } = await execute(
    "INSERT INTO conversations (type, name, creator_id) VALUES ('group', ?, ?)",
    [name, me.id],
  );
  const all = [me.id, ...memberIds];
  const values = all.map(() => '(?, ?)').join(', ');
  await execute(
    `INSERT INTO conversation_members (conversation_id, user_id) VALUES ${values}`,
    all.flatMap((id) => [insertId, id]),
  );
  await pushConversationToMembers(insertId, all, 'conversation:new');
  res.status(201).json({ conversation: await getConversationFor(insertId, me.id) });
}));

// 历史文字内容检索（仅本用户参与的会话）
router.get('/conversations/search', authRequired, ah(async (req, res) => {
  const keyword = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!keyword) {
    throw new HttpError(400, '请输入搜索关键字');
  }
  if (keyword.length > 100) {
    throw new HttpError(400, '关键字过长');
  }
  const limit = Math.min(Math.max(requireId(req.query.limit ?? 20, '数量'), 1), 50);
  const before = Number(req.query.before);
  const { results, hasMore } = await searchMessages(
    req.user!.id,
    keyword,
    limit,
    Number.isFinite(before) && before > 0 ? before : undefined,
  );
  res.json({ results, hasMore });
}));

// 会话详情（含成员）
router.get('/conversations/:id', authRequired, ah(async (req, res) => {
  const conversationId = requireId(req.params.id, '会话');
  await requireMembership(conversationId, req.user!.id);
  const [conversation, members] = await Promise.all([
    getConversationFor(conversationId, req.user!.id),
    listMembers(conversationId),
  ]);
  res.json({ conversation, members });
}));

// 重命名群聊（群主或管理员）
router.put('/conversations/:id/name', authRequired, ah(async (req, res) => {
  const me = req.user!;
  const conversationId = requireId(req.params.id, '会话');
  const name = requireString(req.body?.name, '群名称', 64);
  const conv = await getConversationBasic(conversationId);
  if (!conv) {
    throw new HttpError(404, '会话不存在');
  }
  if (conv.type !== 'group') {
    throw new HttpError(400, '私聊不能重命名');
  }
  const isCreator = Number(conv.creator_id) === me.id;
  if (!isCreator && me.role !== 'admin') {
    throw new HttpError(403, '仅群主或管理员可以修改群名称');
  }
  await execute('UPDATE conversations SET name = ? WHERE id = ?', [name, conversationId]);
  await notifyMembersChanged(conversationId);
  res.json({ ok: true });
}));

// 添加群成员（群内成员均可邀请）
router.post('/conversations/:id/members', authRequired, ah(async (req, res) => {
  const conversationId = requireId(req.params.id, '会话');
  const conv = await getConversationBasic(conversationId);
  if (!conv) {
    throw new HttpError(404, '会话不存在');
  }
  if (conv.type !== 'group') {
    throw new HttpError(400, '私聊不能添加成员');
  }
  await requireMembership(conversationId, req.user!.id);

  const userIds = requireIdArray(req.body?.userIds, '成员');
  await requireApprovedUsers(userIds);

  const values = userIds.map(() => '(?, ?)').join(', ');
  await execute(
    `INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES ${values}`,
    userIds.flatMap((id) => [conversationId, id]),
  );
  // 新成员收到新会话事件，老成员收到刷新事件
  await pushConversationToMembers(conversationId, userIds, 'conversation:new');
  await notifyMembersChanged(conversationId);
  res.json({ members: await listMembers(conversationId) });
}));

// 移除成员 / 退出群聊
router.delete('/conversations/:id/members/:userId', authRequired, ah(async (req, res) => {
  const me = req.user!;
  const conversationId = requireId(req.params.id, '会话');
  const targetId = requireId(req.params.userId, '成员');
  const conv = await getConversationBasic(conversationId);
  if (!conv) {
    throw new HttpError(404, '会话不存在');
  }
  if (conv.type !== 'group') {
    throw new HttpError(400, '私聊不支持移除成员');
  }
  await requireMembership(conversationId, me.id);
  if (!(await isMember(conversationId, targetId))) {
    throw new HttpError(404, '该用户不在群聊中');
  }

  const isSelf = targetId === me.id;
  const isCreator = Number(conv.creator_id) === me.id;
  if (!isSelf && !isCreator && me.role !== 'admin') {
    throw new HttpError(403, '仅群主或管理员可以移除成员');
  }
  if (targetId === Number(conv.creator_id)) {
    throw new HttpError(400, '不能移除群主，如需解散请联系管理员');
  }

  await execute('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [conversationId, targetId]);
  sendToUser(targetId, { type: 'conversation:removed', payload: { conversationId } });
  await notifyMembersChanged(conversationId);
  res.json({ ok: true });
}));

// 消息分页
router.get('/conversations/:id/messages', authRequired, ah(async (req, res) => {
  const conversationId = requireId(req.params.id, '会话');
  await requireMembership(conversationId, req.user!.id);
  const before = req.query.before !== undefined ? requireId(req.query.before, 'before') : null;
  const rawLimit = Number(req.query.limit ?? 30);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;
  const messages = await listMessages(conversationId, before, limit);
  res.json({ messages, hasMore: messages.length === limit });
}));

// REST 发送消息（WS 不可用时的降级通道）
router.post('/conversations/:id/messages', authRequired, ah(async (req, res) => {
  const conversationId = requireId(req.params.id, '会话');
  const msgType = (req.body?.type ?? 'text') as MessageType;
  if (!MESSAGE_TYPES.includes(msgType)) {
    throw new HttpError(400, '消息类型不支持');
  }
  const message = await createMessage(
    req.user!,
    conversationId,
    msgType,
    typeof req.body?.content === 'string' ? req.body.content : '',
    req.body?.fileId !== undefined && req.body?.fileId !== null ? requireId(req.body.fileId, '附件') : null,
  );
  await sendToConversation(conversationId, { type: 'message:new', payload: { message } });
  res.status(201).json({ message });
}));

// 上报已读
router.post('/conversations/:id/read', authRequired, ah(async (req, res) => {
  const conversationId = requireId(req.params.id, '会话');
  await requireMembership(conversationId, req.user!.id);
  await markRead(conversationId, req.user!.id);
  await sendToConversation(conversationId, {
    type: 'read:update',
    payload: { conversationId, userId: req.user!.id },
  });
  res.json({ ok: true });
}));

export default router;
