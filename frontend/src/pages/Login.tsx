import { useState } from 'react';
import client from '../api/client.ts';

interface LoginProps {
  onLoginSuccess: (token: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await client.post('/api/login', { username, password });
      const token = res.data.access_token;
      localStorage.setItem('taopf_token', token);
      onLoginSuccess(token);
    } catch (err: any) {
      setError(err.response?.data?.detail || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#04060a]/90 flex justify-center items-center z-50">
      <div className="glass-card w-full max-w-[420px] p-10 shadow-2xl text-center">
        <h2 className="text-2xl font-bold mb-2 text-white">☯ TAO 排放监控系统</h2>
        <p className="text-sm text-gray-400 mb-8">请输入管理员凭证以访问控制面板</p>
        
        <form onSubmit={handleSubmit} className="text-left space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">账号</label>
            <input
              type="text"
              required
              className="glass-input w-full px-4 py-3 text-sm focus:border-accentBlue focus:ring-1 focus:ring-accentBlue"
              placeholder="请输入管理员账号"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">密码</label>
            <input
              type="password"
              required
              className="glass-input w-full px-4 py-3 text-sm focus:border-accentBlue focus:ring-1 focus:ring-accentBlue"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-lg text-white font-medium text-sm transition-all duration-200 shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 disabled:opacity-50"
          >
            {loading ? '正在验证...' : '安全登录'}
          </button>
        </form>

        {error && <div className="mt-4 text-xs text-red-500 font-medium">{error}</div>}
      </div>
    </div>
  );
}
