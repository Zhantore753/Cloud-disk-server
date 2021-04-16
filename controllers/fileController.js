const fileService = require('../services/fileService');
const config = require('config');
const fs = require('fs');
const User = require('../models/User');
const File = require('../models/File');
const Uuid = require('uuid');

class FileController{
    async createDir(req, res) {
        try {
            const {name, type, parent} = req.body;
            const file = new File({name, type, parent, user: req.user.id});
            const parentFile = await File.findOne({_id: parent});
            if(!parentFile) {
                file.path = name;
                await fileService.createDir(file);
            } else {
                file.path = `${parentFile.path}\\${file.name}`;
                await fileService.createDir(file);
                parentFile.childs.push(file._id);
                await parentFile.save();
            }
            await file.save();
            return res.json(file);
        } catch (e) {
            console.log(e);
            return res.status(400).json(e);
        }
    }

    async getFiles(req, res) {
        try {
            const {sort} = req.query;
            let files;
            let parent = await File.find({_id: req.query.parent});

            switch (sort){
                case 'name':
                    files = await File.find({user: req.user.id, parent: req.query.parent}).sort({name:1});
                    break;
                case 'type':
                    files = await File.find({user: req.user.id, parent: req.query.parent}).sort({type:1});
                    break;
                case 'date':
                    files = await File.find({user: req.user.id, parent: req.query.parent}).sort({date:1});
                    break;
                default: 
                    files = await File.find({user: req.user.id, parent: req.query.parent});
                    break;
            }
            let response = {
                files,
                parent
            }
            
            return res.json(response);
        } catch (e) {
            console.log(e);
            return res.status(500).json({message: "Не удалось получить файлы"})
        }
    }

    async uploadFile(req, res){
        try{
            const file = req.files.file;

            const parent = await File.findOne({user: req.user.id, _id: req.body.parent});
            const user = await User.findOne({_id: req.user.id});

            if(user.usedSpace + file.size > user.diskSpace){
                return res.status(400).json({message: 'На диске не осталось свободного места'});
            }

            user.usedSpace = user.usedSpace + file.size;

            let path;
            if(parent){
                path = `${config.get('filePath')}\\${user._id}\\${parent.path}\\${file.name}`;
            }else{
                path = `${config.get('filePath')}\\${user._id}\\${file.name}`;
            }

            if(fs.existsSync(path)){
                return res.status(400).json({message: 'Такой файл уже есть!'})
            }
            file.mv(path);

            const type = file.name.split('.').pop();
            let filePath = file.name;
            let dbFile;
            if(parent){
                filePath = parent.path + "\\" + file.name;
                dbFile = new File({
                    name: file.name,
                    type,
                    size: file.size,
                    path: filePath,
                    parent: parent._id,
                    user: user._id
                });
            }else{
                dbFile = new File({
                    name: file.name,
                    type,
                    size: file.size,
                    path: filePath,
                    user: user._id
                });
            }

            await dbFile.save();
            await user.save();

            res.json(dbFile);
        }catch(e){
            console.log(e);
            return res.status(500).json({message: "Ошибка загрузки, повторите попытку"});
        }
    }

    async downloadFile(req, res) {
        try {
            const file = await File.findOne({_id: req.query.id, user: req.user.id});
            const path = config.get('filePath') + '\\' + req.user.id + '\\' + file.path;
            if (fs.existsSync(path)) {
                return res.download(path, file.name);
            }
            return res.status(400).json({message: "Download error"});
        } catch (e) {
            console.log(e);
            res.status(500).json({message: "Download error"});
        }
    }

    async deleteFile(req, res){
        try{
            const file = await File.findOne({_id: req.query.id, user: req.user.id});
            if(!file){
                return res.status(404).json({message: "Файл не найден"});
            }
            fileService.deleteFile(file);
            await file.remove();
            return res.json({message: "Файл был удален"});
        } catch(e){
            console.log(e);
            return res.status(400).json({message: 'Директория не пуста'});
        }
    }

    async searchFile(req, res) {
        try {
            const searchName = req.query.search;
            let files = await File.find({user: req.user.id});
            files = files.filter(file => file.name.includes(searchName));
            return res.json(files);
        } catch (e) {
            console.log(e);
            return res.status(400).json({message: 'Ошибка поиска'});
        }
    }

    async uploadAvatar(req, res) {
        try {
            const file = req.files.file
            const user = await User.findById(req.user.id)
            const avatarName = Uuid.v4() + ".jpg"
            file.mv(config.get('staticPath') + "\\" + avatarName)
            user.avatar = avatarName
            await user.save()
            return res.json({message: "Avatar was uploaded"})
        } catch (e) {
            console.log(e)
            return res.status(400).json({message: 'Upload avatar error'})
        }
    }

    async deleteAvatar(req, res) {
        try {
            const user = await User.findById(req.user.id)
            fs.unlinkSync(config.get('staticPath') + "\\" + user.avatar)
            user.avatar = null
            await user.save()
            return res.json(user)
        } catch (e) {
            console.log(e)
            return res.status(400).json({message: 'Delete avatar error'})
        }
    }
}

module.exports = new FileController();