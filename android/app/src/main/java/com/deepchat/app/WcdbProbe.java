package com.deepchat.app;

import com.tencent.wcdb.WCDBField;
import com.tencent.wcdb.WCDBTableCoding;

@WCDBTableCoding
public class WcdbProbe {
    @WCDBField
    public int id;

    @WCDBField
    public String content;
}

