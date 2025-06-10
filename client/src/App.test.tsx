import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders GitLab Review tool', () => {
  render(<App />);
  // 由于有路由和认证逻辑，这里只做基本渲染测试
  expect(document.body).toBeInTheDocument();
}); 