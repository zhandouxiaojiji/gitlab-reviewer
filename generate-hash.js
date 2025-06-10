const bcrypt = require('bcryptjs');

const generateHash = async () => {
  const password = '123456';
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);
  console.log(`密码: ${password}`);
  console.log(`哈希值: ${hash}`);
  
  // 验证哈希值
  const isValid = await bcrypt.compare(password, hash);
  console.log(`验证结果: ${isValid}`);
};

generateHash(); 