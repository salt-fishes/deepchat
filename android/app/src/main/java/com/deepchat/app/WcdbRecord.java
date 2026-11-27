package com.deepchat.app;

import com.tencent.wcdb.WCDBField;
import com.tencent.wcdb.WCDBTableCoding;

/**
 * WCDB 通用记录：id 由「种类:键」组成，json 保存会话/摘要，blob 保存附件原件。
 * 注解处理器会生成同包的 DBWcdbRecord，不要手写生成类。
 */
@WCDBTableCoding
public class WcdbRecord {
    @WCDBField(isPrimary = true)
    public String id;

    @WCDBField
    public String json;

    @WCDBField
    public byte[] blob;

    @WCDBField
    public String mimeType;

    public WcdbRecord() {}
}

