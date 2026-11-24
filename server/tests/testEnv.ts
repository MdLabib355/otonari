// The tests never touch a real S3 bucket: photos go to server/uploads. (dotenv keeps what is already set.)
process.env.S3_BUCKET = '';
process.env.SMTP_HOST = '';
