import type { Session } from './kitchen';

export function mealRecordOrigin(session: Session) {
  if (session.authoredRecord)
    return session.authoredRecord.author + '实做 · 本人提供照片与食忆';
  return session.sampleRecord
    ? '预置样例食忆 · 非真实做菜记录'
    : '个人记忆 · 用户自述';
}

export function mealRecordDate(session: Session) {
  if (session.authoredRecord) {
    const captured = session.authoredRecord.photoCapturedAt;
    return captured ? '拍摄于 ' + captured.slice(0, 10) : '拍摄日期未记录';
  }
  const date = new Date(session.completedAt || session.createdAt);
  return Number.isNaN(date.getTime())
    ? '日期未记录'
    : date.toLocaleDateString('zh-CN');
}
