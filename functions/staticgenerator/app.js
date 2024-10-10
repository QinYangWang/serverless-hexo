import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import simpleGit from 'simple-git';
import fs from 'fs';
import { promisify } from 'util';
import Hexo from 'hexo';

const s3Client = new S3Client();
const bucketName = process.env.BUCKET_NAME;

const readdir = promisify(fs.readdir);

export const handler = async (event) => {
    try {
        // 设置Hexo项目路径
        const hexoProjectPath = path.join('/tmp', 'my-blog');

        // 克隆GitHub仓库
        await simpleGit().clone('https://github.com/QinYangWang/blog.git', hexoProjectPath);

        // 使用Hexo API生成静态文件
        const hexo = new Hexo(hexoProjectPath, {config_path: `${hexoProjectPath}/_config.yml`});
        await hexo.init();
        await hexo.call('generate', { watch: false });

        // 获取生成的静态文件路径
        const publicPath = path.join(hexoProjectPath, 'public');

        // 上传静态文件到S3
        const files = await readDirRecursive(publicPath);
        for (const file of files) {
            const relativePath = path.relative(publicPath, file);
            const params = {
                Bucket: bucketName,
                Key: relativePath,
                Body: fs.createReadStream(file),
            };
            await s3Client.send(new PutObjectCommand(params));
        }
        return {
            statusCode: 200,
            body: JSON.stringify('Hexo static files generated and uploaded to S3 successfully!'),
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify('Error generating and uploading Hexo static files.'),
        };
    }
};

async function readDirRecursive(dir) {
    const files = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await readDirRecursive(fullPath));
        } else {
            files.push(fullPath);
        }
    }
    return files;
}
