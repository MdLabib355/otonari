import express from 'express';
import { addItem, deleteItem, requestNewItem, showItem, showMyItems, showShelf, updateItem } from './itemController.ts';
import { requireMember } from '../../core/auth.ts';
import { check, read, write } from '../../core/http.ts';
import { deleteRefusedPhoto, storeOptionalPhoto } from '../../core/photoFiles.ts';
import { receiveOptionalPhoto } from '../../core/receivePhoto.ts';

const router = express.Router();

// JSON, or a form with a photo of the item
const optionalPhoto = [receiveOptionalPhoto, storeOptionalPhoto, deleteRefusedPhoto];

router.get('/items', read(requireMember, showShelf));
router.get('/me/items', read(requireMember, showMyItems));
router.get('/items/:id', read(requireMember, showItem));
router.post('/items', check(requireMember), ...optionalPhoto, write(requireMember, addItem));
router.post('/items/request', check(requireMember), ...optionalPhoto, write(requireMember, requestNewItem));
router.patch('/items/:id', check(requireMember), ...optionalPhoto, read(requireMember, updateItem));
router.delete('/items/:id', write(requireMember, deleteItem));

export default router;
