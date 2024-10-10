const { execSync } = require('child_process');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const { promisify } = require('util');
const Hexo = require('hexo');

const s3Client = new S3Client();
const readdir = promisify(fs.readdir);

const bucketName = process.env.BUCKET_NAME;


exports.handler = async (event) => {
    try {
        // 设置Hexo项目路径
        const hexoProjectPath = path.join('/tmp', 'my-blog');

        // 克隆GitHub仓库
        execSync(`rm -rf ${hexoProjectPath}`, { encoding: 'utf8', stdio: 'inherit' })
        execSync(`cd /tmp && git clone https://github.com/QinYangWang/blog.git ${hexoProjectPath}`, { encoding: 'utf8', stdio: 'inherit' })
        const fileslist = execSync(`ls ${hexoProjectPath}`, { encoding: 'utf8' }).split('\n')
        console.log(fileslist);
        // 使用Hexo API生成静态文件
        const hexo = new Hexo(hexoProjectPath, {config: `${hexoProjectPath}/_config.yml`});
        hexo.loadPlugin(require.resolve('hexo-generator-archive'));
        hexo.loadPlugin(require.resolve('hexo-generator-category'));
        hexo.loadPlugin(require.resolve('hexo-generator-index'));
        hexo.loadPlugin(require.resolve('hexo-generator-tag'));
        hexo.loadPlugin(require.resolve('hexo-renderer-ejs'));
        hexo.loadPlugin(require.resolve('hexo-renderer-marked'));
        hexo.loadPlugin(require.resolve('hexo-renderer-stylus'));
        await hexo.init().then(async () => {
            console.info("Running Hexo Generate");
            await hexo.call('generate', { watch: false }).then(async () => {
                console.info(`Hexo Generate done`);
                hexo.exit();
                const afterFilesList = execSync(`ls ${hexoProjectPath}`, { encoding: 'utf8' }).split('\n')
                console.log(afterFilesList);
                // 获取生成的静态文件路径
                const publicPath = path.join(hexoProjectPath, 'public');
                const publicPathFilesList = execSync(`ls ${publicPath}`, { encoding: 'utf8' }).split('\n')
                console.log(publicPathFilesList);
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
            }).catch(function (err) {
                hexo.exit(err)
                console.error('Error:', err);
                return {
                    statusCode: 500,
                    body: JSON.stringify('Error generating and uploading Hexo static files.'),
                };
            });;
        }).catch(function (err) {
          console.error('Error:', err);
          hexo.exit(err)
          return {
            statusCode: 500,
            body: JSON.stringify('Error init Hexo static files.'),
        };
        });
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
