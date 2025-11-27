from flask import Flask, request, jsonify
from flask_cors import CORS
import networkx as nx
import io

# initialize flask app
app = Flask(__name__)

CORS(app)


# parse graph from txt
def parse_graph_from_text(content):
    """
    假设用户上传的文件是简单的“边列表”格式，例如：
    0 1
    1 2
    2 0
    每一行代表一条边，连接两个点。
    """
    G = nx.Graph()
    lines = content.split('\n')
    for line in lines:
        parts = line.strip().split()
        if len(parts) >= 2:
            # 读取两个点，转成整数（或者保持字符串也可以）
            u, v = parts[0], parts[1]
            G.add_edge(u, v)
    return G


# --- 2. 定义接口：上传文件的入口 ---
@app.route('/check-planarity', methods=['POST'])
def check_planarity():
    # 检查是否有文件上传
    if 'file' not in request.files:
        return jsonify({"error": "没有上传文件"}), 400

    file = request.files['file']

    try:
        # A. 读取文件内容
        # file.read() 读出来是字节，decode 把它变成字符串
        content = file.read().decode('utf-8')

        # B. 解析图数据 (这是你的核心工作之一)
        G = parse_graph_from_text(content)

        # 简单的验证：如果图是空的
        if G.number_of_nodes() == 0:
            return jsonify({"error": "解析失败，图是空的"}), 400

        # ==========================================
        # C. 这里就是你把球传给 成员 B 的地方！
        # ==========================================
        # 暂时我们先写个假的返回，等成员 B 写好函数，你就调用他的函数
        # result = member_b_logic(G)

        # --- 假装 B 已经处理完了 ---
        response_data = {
            "message": "文件接收成功！",
            "node_count": G.number_of_nodes(),
            "edge_count": G.number_of_edges(),
            "status": "waiting_for_member_b"
        }
        # ==========================================

        return jsonify(response_data)

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500


# 3. 启动服务
if __name__ == '__main__':
    print("后端服务已启动: http://localhost:5000")
    app.run(debug=True, port=5000)