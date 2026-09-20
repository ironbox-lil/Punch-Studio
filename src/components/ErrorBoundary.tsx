import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    console.error('Editor error boundary:', info.componentStack);
  }

  render() {
    return this.state.failed ? (
      <div className="fatal-error">
        <h1>工作台暂时遇到问题</h1>
        <p>原始照片没有被修改。请刷新页面后重试。</p>
        <button onClick={() => location.reload()}>重新打开工作台</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
