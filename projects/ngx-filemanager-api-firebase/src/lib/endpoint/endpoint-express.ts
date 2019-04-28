// Add middle ware to this route
const express = require('express');
import {
  OptionRequestsAreOk,
  PostRequestsOnly,
  HasBodyProp,
  HasQueryParam
} from './middleware-helpers';
import { Storage } from '../types/google-cloud-types';
import { NgxFileMangerApiFireBaseClass } from '../api/firebase-storage-api';
import { VError } from 'verror';

let fmApi: NgxFileMangerApiFireBaseClass;

const endpoint = express();
endpoint.use(OptionRequestsAreOk);

endpoint.use('/hello', async (req, res) => {
  console.log('HELLO');
  res.status(200).send('HELLO\n');
});

endpoint.use(PostRequestsOnly);

import { ParseUploadFile, UploadedFile } from './middleware-upload';
import { permsQueries } from '../permissions/permissions-queries';
import { CoreTypes } from 'ngx-filemanager-core';
endpoint.post(
  '/upload',
  HasQueryParam('bucketname'),
  HasQueryParam('directoryPath'),
  ParseUploadFile,
  async (req, res, next) => {
    const bucketname: string = req.query.bucketname;
    const directoryPath: string = req.query.directoryPath;
    const files = req.files as UploadedFile[];
    const userClaims = await permsQueries.RetrieveCustomClaims(req);
    try {
      const results = await Promise.all(
        files.map(file =>
          trySaveFile(bucketname, directoryPath, file, userClaims)
        )
      );
      const success = {
        result: {
          success: true
        }
      };
      const finalResult = results.reduce((acc, cur) => {
        if (cur.result.error) {
          return cur;
        }
        return success;
      }, success);
      res.status(200).send(finalResult);
    } catch (error) {
      console.error(
        'Error occurred while uploading: \n',
        VError.fullStack(error)
      );
      res
        .status(400)
        .send('Error occurred while uploading: \n' + error.message);
      return;
    }
  }
);

async function trySaveFile(
  bucketname: string,
  directoryPath: string,
  f: UploadedFile,
  userClaims: CoreTypes.UserCustomClaims
) {
  return fmApi.HandleSaveFile(
    bucketname,
    directoryPath,
    f.originalname,
    f.mimetype,
    f.buffer,
    userClaims
  );
}

endpoint.use(
  '/',
  HasBodyProp('action'),
  HasBodyProp('bucketname'),
  async (req, res) => {
    const action: CoreTypes.FileManagerAction = req.body.action;
    try {
      const userClaims = await permsQueries.RetrieveCustomClaims(req);
      let body;
      switch (action) {
        case 'list':
          body = await fmApi.HandleList(req.body, userClaims);
          break;
        case 'rename':
          body = await fmApi.HandleRename(req.body, userClaims);
          break;
        case 'move':
          body = await fmApi.HandleMove(req.body, userClaims);
          break;
        case 'copy':
          body = await fmApi.HandleCopy(req.body, userClaims);
          break;
        case 'remove':
          body = await fmApi.HandleRemove(req.body, userClaims);
          break;
        case 'edit':
          body = await fmApi.HandleEdit(req.body, userClaims);
          break;
        case 'getContent':
          body = await fmApi.HandleGetContent(req.body, userClaims);
          break;
        case 'createFolder':
          body = await fmApi.HandleCreateFolder(req.body, userClaims);
          break;
        case 'getMeta':
          body = await fmApi.HandleGetMeta(req.body, userClaims);
          break;
        case 'changePermissions':
          body = await fmApi.HandleSetPermissions(req.body, userClaims);
          break;
        case 'compress':
        case 'extract':
        case 'downloadMultiple':
        default:
          throw new Error('action has not been implemented');
      }
      res.status(200).send(body);
    } catch (error) {
      console.error(
        'Error while processing request: \n',
        VError.fullStack(error)
      );
      const returnedError = {
        error: `Bad request to ngx-file-manager!`,
        errorDetail: error.message,
        requestBody: req.body
      };
      res.status(400).send(returnedError);
    }
  }
);
endpoint.use(notImplemented);

async function notImplemented(req, res) {
  const bodyString = JSON.stringify(req.body);
  res.status(501).send('That request has not been implemented: ' + bodyString);
}

/*
Use by attaching to a firebase function
exports.FileManagerApi = StorageEndpoint;
*/
export const FileManagerEndpointExpress = (storage: Storage) => {
  fmApi = new NgxFileMangerApiFireBaseClass(storage);
  return endpoint;
};
