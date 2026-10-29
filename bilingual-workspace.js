/* Exact UI translations only. Customer-entered content, input values and IDs are never translated. */
'use strict';
const idLocale={
 '关闭凭证':'Tutup bukti','付款凭证':'Bukti pembayaran','测试凭证 · 未发生真实转账':'Bukti uji · tidak ada transfer nyata','付款凭证 · 请核实银行到账':'Bukti pembayaran · periksa dana masuk ke bank',
 '收货管理':'Kelola penerimaan','收货记录':'Riwayat penerimaan',
 '工作台':'Ruang kerja','集运系统 /':'Sistem pengiriman /','本地测试数据库':'Basis data pengujian lokal','开发版 · 本地隔离数据库':'Versi pengembangan · basis data lokal terpisah','重启清空，禁止真实付款或寄件':'Data dihapus saat mulai ulang. Jangan bayar atau kirim barang nyata.','切换测试商家':'Beralih ke pelanggan uji','切换测试仓库':'Beralih ke gudang uji','切换测试运营':'Beralih ke admin uji','v3.1 开发验收 · 整单一次结算':'v3.1 Uji pengembangan · satu pembayaran per pesanan',
 '每页':'Per halaman','上一页':'Sebelumnya','下一页':'Berikutnya','商家先寄到国内深圳仓，再由仓库安排出境。':'Kirim paket ke gudang Shenzhen terlebih dahulu, lalu gudang mengatur pengiriman internasional.',
 '本单唯一应付：':'Total pesanan yang harus dibayar:','。请使用下方生成的测试凭证，无需真实转账。':'. Gunakan bukti uji yang dibuat di bawah, tanpa transfer uang nyata.','。请确认向上方账户完成转账后，再提交资料。':'. Kirim data setelah transfer ke rekening di atas selesai.',
 '提交凭证 → 运营核对整单金额 → 待出货；头程尾程无需再次付款。':'Kirim bukti → admin memverifikasi total → siap dikirim. Tidak ada pembayaran tambahan untuk tahap awal atau akhir.',
 '记录订单、费用、权限和平台配置的关键变更。':'Mencatat perubahan penting pesanan, biaya, izin, dan pengaturan platform.','返回看板':'Kembali ke dasbor','时间':'Waktu','操作人':'Pelaku','动作':'Tindakan','对象':'Objek','结果':'Hasil','暂无审计记录':'Belum ada catatan audit','已记录':'Tercatat',
 '合包订单已提交':'Pesanan gabungan diajukan','深圳仓包裹已收货':'Paket diterima di gudang Shenzhen','合包实测已保存':'Pengukuran paket gabungan tersimpan','头程尾程费用已复核':'Biaya awal dan akhir sudah diverifikasi','测试凭证已提交':'Bukti uji dikirim','付款凭证已提交':'Bukti pembayaran dikirim','测试付款审核通过':'Pembayaran uji disetujui','付款审核通过':'Pembayaran disetujui','付款凭证已退回':'Bukti pembayaran dikembalikan','头程已出货':'Pengiriman ke Indonesia dimulai','印尼仓已到货':'Tiba di gudang Indonesia','尾程快递已发出':'Paket dikirim melalui kurir akhir','客户已签收':'Pelanggan menerima paket',
 '已确认全部费用后只付款一次':'Bayar sekali setelah seluruh biaya dikonfirmasi','待付款':'Menunggu pembayaran','付款审核中':'Pembayaran sedang diverifikasi','尾程费用待复核':'Biaya pengiriman akhir menunggu verifikasi',
 'Eaztrans集运':'Eaztrans Logistik','Eaztrans 集运':'Eaztrans Logistik','跨境包裹，从深圳仓到目的地。':'Paket lintas negara, dari Shenzhen ke alamat tujuan.',
 '登录后按你的角色进入专属工作台，系统会把每一步串起来，完成当前步骤后再进入下一步。':'Masuk ke ruang kerja sesuai peran dan ikuti setiap langkah secara berurutan.',
 '商家预报包裹，选择是否合包':'Pelanggan mendaftarkan paket dan mengajukan penggabungan',
 '仓库入库确认，测量并生成费用':'Gudang menerima, mengukur, dan menghitung biaya',
 '头程尾程复核后一次付款，再出货与查询物流':'Bayar sekaligus setelah biaya diverifikasi, lalu kirim dan lacak',
 '登录系统':'Masuk ke sistem','请选择你的工作台，再输入会员号或邮箱和密码。':'Pilih peran, lalu masukkan nomor anggota atau email serta kata sandi.',
 '商家端':'Pelanggan','仓库端':'Gudang','运营后台':'Admin','登录':'Masuk','退出登录':'Keluar','会员号 / 邮箱':'Nomor anggota / email','密码':'Kata sandi',
 '跨境商家登录':'Masuk pelanggan','仓库操作员登录':'Masuk petugas gudang','运营管理员登录':'Masuk administrator',
 '登录成功后直接进入跨境商家控制台。':'Setelah masuk, buka dasbor pelanggan.','登录成功后直接进入仓库操作员控制台。':'Setelah masuk, buka dasbor gudang.','登录成功后直接进入运营管理员控制台。':'Setelah masuk, buka dasbor admin.',
 '登录并进入跨境商家':'Masuk sebagai pelanggan','登录并进入仓库操作员':'Masuk sebagai petugas gudang','登录并进入运营管理员':'Masuk sebagai administrator',
 '还没有商家账号？':'Belum punya akun pelanggan?','注册商家账号':'Daftar akun pelanggan','内部账号由平台创建，请使用已分配的账号登录。':'Akun internal dibuat platform. Gunakan akun yang telah diberikan.',
 '仓库操作员和运营管理员账号由平台创建；注册入口仅开放给跨境商家。':'Akun gudang dan admin dibuat platform. Pendaftaran hanya untuk pelanggan.',
 '首页':'Beranda','我的包裹':'Paket saya','我的订单':'Pesanan saya','运输计算器':'Kalkulator pengiriman','地址管理':'Kelola alamat','消息与客服':'Pesan dan bantuan','我的账户':'Akun saya',
 '业务办理':'Layanan pengiriman','常用服务':'Layanan umum','账户与支持':'Akun dan bantuan','仓库工作台':'Meja kerja gudang','待收货客户':'Pelanggan menunggu penerimaan','合包与费用复核':'Penggabungan dan verifikasi biaya','出货与物流':'Pengiriman dan pelacakan',
 '运营看板':'Dasbor admin','订单与异常':'Pesanan dan masalah','渠道 / 箱型 / 运价':'Jalur / karton / tarif','审计日志':'Log audit','客服工单':'Tiket bantuan','商家与仓库账号':'Akun pelanggan dan gudang','付款审核':'Verifikasi pembayaran','收款账户':'Rekening penerima',
 '数据库已配置':'Basis data dikonfigurasi','数据库已连接':'Basis data terhubung','演示环境':'Lingkungan demo','刷新数据':'Muat ulang data','刷新':'Muat ulang','同步中':'Menyinkronkan','返回':'Kembali',
 '编辑':'Ubah','删除':'Hapus','查询':'Cari','保存':'Simpan','取消':'Batal','确认':'Konfirmasi','全部':'Semua','操作':'Tindakan','状态':'Status','默认':'Utama','未填写':'Belum diisi','暂无对应记录':'Belum ada data',
 '国内快递单号':'Nomor resi domestik','包裹品名':'Nama isi paket','提交预报':'Kirim informasi paket','预报包裹':'Daftarkan paket','去预报包裹':'Daftarkan paket','待入库':'Menunggu penerimaan','已入库':'Sudah diterima','已打包':'Sudah dikemas','异常':'Bermasalah','已签收':'Diterima penerima','已出货':'Sudah dikirim','测量中':'Sedang diukur','已测量':'Sudah diukur',
 '运输区间':'Rute pengiriman','运输渠道':'Jalur pengiriman','请选择渠道':'Pilih jalur','外箱尺寸与重量':'Ukuran dan berat karton','预估费用明细':'Rincian perkiraan biaya','增加一组外箱':'Tambah kelompok karton','增加外箱':'Tambah karton','清空重填':'Atur ulang','计算预估费用':'Hitung perkiraan biaya','开始试算':'Hitung perkiraan','试算':'Hitung','重置':'Atur ulang','移除此组':'Hapus kelompok ini','移除':'Hapus',
 '长（cm）':'Panjang (cm)','宽（cm）':'Lebar (cm)','高（cm）':'Tinggi (cm)','每箱重量（kg）':'Berat per karton (kg)','箱数':'Jumlah karton','长度（cm）':'Panjang (cm)','宽度（cm）':'Lebar (cm)','高度（cm）':'Tinggi (cm)','重量（kg）':'Berat (kg)',
 '海运分别计算体积费和重量费并取高；空运按总实重与总体积重取大。国内仓操作费每票收取一次。合包后的外箱可能变化，最终以仓库测量结果为准。':'Laut menggunakan nilai tertinggi antara biaya volume dan berat. Udara menggunakan berat aktual atau volumetrik tertinggi. Penanganan dibebankan sekali per pesanan. Biaya akhir mengikuti pengukuran gudang.',
 '收货地址':'Alamat penerima','收件人':'Nama penerima','联系电话':'Nomor telepon','国家':'Negara','城市':'Kota','邮编':'Kode pos','详细地址':'Alamat lengkap','地址标签':'Label alamat','新增地址':'Tambah alamat','编辑地址':'Ubah alamat','取消编辑':'Batalkan perubahan','保存地址':'Simpan alamat','尚未保存收货地址':'Belum ada alamat tersimpan','在右侧填写收件人、电话和具体地址。':'Isi nama, telepon, dan alamat lengkap di formulir.',
 '深圳仓地址':'Alamat gudang Shenzhen','去我的包裹办理':'Buka paket saya','收货地址用于整体订单的最终派送，下单时确认。':'Alamat digunakan untuk pengiriman akhir dan dikonfirmasi saat membuat pesanan.',
 '仓库名称':'Nama gudang','仓库地址':'Alamat gudang','收件人 / 联系电话':'Penerima / telepon','送仓识别':'Identifikasi di gudang','复制送仓信息':'Salin alamat gudang','暂未配置仓库':'Gudang belum dikonfigurasi','请联系平台运营人员。':'Hubungi admin platform.',
 '此地址来自平台配置。试运营前请与运营人员确认仓库地址和电话可用。':'Alamat berasal dari konfigurasi platform. Konfirmasikan alamat dan telepon sebelum penggunaan nyata.',
 '账户信息':'Informasi akun','会员号':'Nomor anggota','登录邮箱':'Email masuk','账号类型':'Jenis akun','跨境商家':'Pelanggan lintas negara','账户状态':'Status akun','正常':'Aktif','停用':'Nonaktif','展示名称':'Nama tampilan','保存资料':'Simpan profil','管理登录资料、联系电话和优惠信息。':'Kelola informasi akun dan nomor telepon.',
 '付款资料暂不可用':'Data pembayaran tidak tersedia','付款资料读取失败，请刷新重试；持续失败请联系运营。':'Gagal memuat pembayaran. Muat ulang atau hubungi admin.',
 '暂未启用收款账户':'Rekening penerima belum aktif','请联系运营配置收款账户，此时不能提交凭证。':'Minta admin mengaktifkan rekening sebelum mengirim bukti pembayaran.',
 '测试模式 · 不可转账':'Mode uji · jangan transfer uang','此账号是虚拟账号，不接受真实转账。测试凭证和审核仅模拟业务状态，不代表真实资金到账。':'Rekening virtual tidak menerima uang. Bukti dan persetujuan hanya simulasi, bukan penerimaan dana.',
 '银行转账':'Transfer bank','请按本单最终金额转账一次，再提交凭证。运营核实到账后才确认付款成功。':'Transfer sekali sesuai total akhir dan unggah bukti. Pembayaran dikonfirmasi setelah admin memeriksa dana.',
 '收款账户 · 仅供测试':'Rekening penerima · hanya pengujian','收款账户 · 人民币':'Rekening penerima · CNY','收款银行':'Bank penerima','账户名称':'Nama pemilik rekening','收款账号':'Nomor rekening','开户行':'Cabang bank','币种':'Mata uang',
 '请补充付款凭证':'Lengkapi bukti pembayaran','测试凭证待运营审核':'Bukti uji menunggu verifikasi admin','付款凭证待运营审核':'Bukti pembayaran menunggu verifikasi admin','凭证已保存，尚未确认付款成功。请等待运营审核，不要重复转账。':'Bukti tersimpan, pembayaran belum dikonfirmasi. Tunggu verifikasi admin dan jangan transfer lagi.',
 '刷新审核结果':'Muat ulang hasil verifikasi','凭证审核记录':'Riwayat verifikasi bukti','查看凭证':'Lihat bukti','待运营审核':'Menunggu verifikasi admin','审核通过':'Disetujui','凭证需补充':'Bukti perlu dilengkapi','测试':'Pengujian',
 '提交测试凭证':'Kirim bukti uji','提交付款凭证':'Kirim bukti pembayaran','测试付款人':'Nama pembayar uji','付款人姓名':'Nama pembayar','转账时间':'Waktu transfer','转账备注 / 流水号（选填）':'Catatan / referensi transfer (opsional)','凭证图片（PNG / JPG / WebP，最大5MB）':'Gambar bukti (PNG / JPG / WebP, maks. 5 MB)','备注（选填）':'Catatan (opsional)','自动生成带有“测试凭证、未发生转账”水印的图片':'Buat gambar dengan tanda air bukti uji, tanpa transfer nyata','提交凭证，等待审核':'Kirim bukti dan tunggu verifikasi',
 '上传凭证不代表付款成功；运营审核通过后进入待出货。':'Unggahan bukti belum berarti lunas. Setelah disetujui, pesanan siap dikirim.',
 '收款账户配置':'Pengaturan rekening penerima','默认使用虚拟账号测试；切换真实收款前请填写你自己的银行资料。':'Gunakan rekening virtual untuk pengujian. Isi rekening bank milik Anda sebelum menerima uang nyata.',
 '配置暂不可用':'Pengaturan tidak tersedia','未读取到账户':'Rekening belum dimuat','请刷新数据。':'Muat ulang data.','收款模式':'Mode penerimaan','测试 · 不可真实转账':'Pengujian · tanpa transfer nyata','真实银行转账 · 人工核实到账':'Transfer bank nyata · verifikasi manual','开户行（选填）':'Cabang bank (opsional)','SWIFT（选填）':'SWIFT (opsional)','转账说明':'Petunjuk transfer','启用此账户':'Aktifkan rekening ini','保存收款配置':'Simpan pengaturan rekening',
 '仅支持人民币，与订单费用保持一致。修改不影响已提交凭证保存的账户快照。真实收款需逐笔核查银行到账，不自动扣款或自动对账。':'Hanya CNY sesuai biaya pesanan. Perubahan tidak mengubah salinan rekening pada bukti lama. Transfer nyata harus diverifikasi satu per satu, tanpa debit atau rekonsiliasi otomatis.',
 '请核查银行实际到账':'Periksa dana yang benar-benar diterima bank','截图仅供核对，不能单凭截图确认收款。请核实收款账户、银行流水和实际到账金额。':'Gambar hanya bukti pendukung. Periksa rekening, referensi bank, dan jumlah dana yang diterima.',
 '应收金额':'Jumlah tagihan','付款人 / 转账时间':'Pembayar / waktu transfer','提交时收款账户':'Rekening saat bukti dikirim','查看私有凭证图片':'Lihat gambar bukti privat','模拟到账金额（CNY）':'Simulasi dana diterima (CNY)','实际到账金额（CNY）':'Dana diterima (CNY)','测试审核流水号（唯一）':'Referensi uji (unik)','银行实际流水号（唯一）':'Referensi bank sebenarnya (unik)','审核说明（退回必填）':'Catatan verifikasi (wajib saat ditolak)',
 '我确认这是模拟测试，不代表真实资金到账':'Saya mengonfirmasi ini simulasi, tanpa dana nyata','我已核实此笔转账真实到账，账户、金额、银行流水一致':'Saya telah memeriksa dana diterima, rekening, jumlah, dan referensi bank','退回，补充凭证':'Kembalikan untuk dilengkapi','测试审核通过':'Setujui simulasi','确认到账，审核通过':'Konfirmasi dana dan setujui',
 '待审核':'Menunggu verifikasi','已通过':'Disetujui','需补充':'Perlu dilengkapi','金额':'Jumlah','类型 / 状态':'Jenis / status','提交时间':'Waktu pengiriman','订单号':'Nomor pesanan','查看审核':'Lihat verifikasi','暂无对应凭证':'Belum ada bukti sesuai filter','本段费用核对':'Periksa biaya pesanan',
 '头程运输费':'Biaya ke Indonesia','国内仓操作费':'Penanganan gudang domestik','已含尾程费':'Termasuk biaya akhir','原账单合计':'Total tagihan','本单金额锁定后不再修改。':'Jumlah tagihan terkunci setelah dikonfirmasi.',
 '操作已保存':'Perubahan tersimpan','请选择至少一个包裹':'Pilih setidaknya satu paket','物流节点读取失败':'Gagal memuat riwayat pengiriman','送仓信息已复制':'Alamat gudang disalin','无法访问剪贴板，请手动复制页面地址':'Papan klip tidak tersedia. Salin alamat secara manual.','收货地址已保存':'Alamat tersimpan','资料已保存':'Profil tersimpan','修改已保存':'Perubahan tersimpan','包裹已删除':'Paket dihapus','已退出登录':'Sudah keluar',
 '注册账号':'Daftar akun','返回登录':'Kembali masuk','注册商家账号':'Daftar akun pelanggan','注册并继续':'Daftar dan lanjutkan','邮箱':'Email','会员号或邮箱':'Nomor anggota atau email','取消':'Batal','重新发送验证邮件':'Kirim ulang email verifikasi','注册后系统自动生成会员号。请使用真实邮箱接收验证邮件；仓库与运营账号由平台分配。':'Nomor anggota dibuat otomatis. Gunakan email aktif untuk verifikasi. Akun gudang dan admin dibuat platform.'
};
Object.assign(idLocale,{
 '账号登录':'Masuk akun','注册邮箱':'Email pendaftaran','重发验证邮件':'Kirim ulang email verifikasi',
 '商家、仓库操作员和管理员均从这里登录，系统按账号权限进入对应工作台。':'Pelanggan, petugas gudang, dan admin masuk di sini. Sistem membuka ruang kerja sesuai izin akun.',
 '注册仅需邮箱和密码；注册成功后系统会生成会员号，之后可用会员号或邮箱登录。':'Daftar dengan email dan kata sandi. Nomor anggota dibuat otomatis dan dapat digunakan untuk masuk.',
 '新注册账号默认是跨境商家；仓库操作员和管理员账号由平台管理员授权。':'Akun baru adalah akun pelanggan. Akun gudang dan admin memerlukan otorisasi platform.',
 '请输入商家账号的会员号或邮箱，系统会自动进入对应工作台。':'Masukkan nomor anggota atau email pelanggan untuk membuka ruang kerja.',
 '请输入仓库操作员账号的会员号或邮箱，系统会自动进入对应工作台。':'Masukkan nomor anggota atau email petugas gudang untuk membuka ruang kerja.',
 '请输入管理员账号的会员号或邮箱，系统会自动进入对应工作台。':'Masukkan nomor anggota atau email admin untuk membuka ruang kerja.',
 '正在保存，请稍候':'Sedang menyimpan, mohon tunggu',
 '演示银行（不可转账）':'Bank uji (jangan transfer uang)','Mospace 虚拟收款账户':'Rekening virtual Mospace',
 '仅用于测试提交凭证与运营审核，不要向此账号转账，不发生真实扣款。':'Hanya untuk pengujian bukti dan verifikasi. Jangan transfer ke rekening ini; tidak ada debit nyata.',
 '仅启用商家可创建订单':'Hanya akun pelanggan aktif yang dapat membuat pesanan',
 '请选择包裹并核对备注':'Pilih paket dan periksa catatan','请填写印尼收件地址':'Isi alamat penerima di Indonesia',
 '请填写完整收件人、电话、城市和地址':'Lengkapi nama penerima, telepon, kota, dan alamat','邮编过长':'Kode pos terlalu panjang',
 '提交内容已变化，请重新开始申请':'Isi pengajuan berubah. Mulai pengajuan baru',
 '请选择印尼空运或印尼海运':'Pilih pengiriman udara atau laut ke Indonesia',
 '请配置深圳仓及印尼中转仓':'Konfigurasikan gudang Shenzhen dan gudang transit Indonesia',
 '包裹已关联订单、异常或不属于本人':'Paket sudah terhubung, bermasalah, atau bukan milik Anda',
 '包裹不存在或重复选择':'Paket tidak ditemukan atau dipilih dua kali','无权收货此包裹':'Anda tidak berhak menerima paket ini',
 '历史订单请使用原入库流程':'Gunakan alur penerimaan lama untuk pesanan historis',
 '包裹已收货或当前不可入库，请刷新':'Paket sudah diterima atau tidak dapat diterima. Muat ulang',
 '无权处理此订单':'Anda tidak berhak memproses pesanan ini',
 '订单状态已变化，请刷新后重新核对':'Status pesanan berubah. Muat ulang dan periksa kembali',
 '请逐件完成全部包裹的实际收货':'Konfirmasikan penerimaan fisik setiap paket terlebih dahulu',
 '请填写1至100个实际合包外箱':'Masukkan 1 hingga 100 karton gabungan yang sebenarnya',
 '线路已停用，请联系运营':'Jalur dinonaktifkan. Hubungi admin',
 '请核对实际外箱重量及尺寸':'Periksa berat dan ukuran karton sebenarnya',
 '请配置海运重量费与体积费取高规则':'Konfigurasikan tarif laut menggunakan biaya berat atau volume tertinggi',
 '无权核定此订单':'Anda tidak berhak memverifikasi pesanan ini',
 '请先完成合包实测，或刷新订单版本':'Selesaikan pengukuran paket gabungan atau muat ulang versi pesanan',
 '请填写有效尾程金额和地址距离核价说明':'Isi biaya akhir yang valid dan dasar harga berdasarkan alamat serta jarak',
 '头程费用尚未生成':'Biaya pengiriman awal belum tersedia','无权更新此订单':'Anda tidak berhak memperbarui pesanan ini',
 '订单已更新，请刷新核对':'Pesanan diperbarui. Muat ulang untuk memeriksa',
 '必须等待运营确认整单付款':'Tunggu admin mengonfirmasi pembayaran seluruh pesanan',
 '请填写承运商及运单号':'Isi nama pengangkut dan nomor resi',
 '当前状态不能执行此步骤，请刷新核对':'Langkah ini tidak sesuai status saat ini. Muat ulang',
 '请填写有效客服消息':'Isi pesan bantuan yang valid','请核对咨询标题、内容和订单':'Periksa judul, isi pertanyaan, dan pesanan',
 '无权回复此咨询':'Anda tidak berhak membalas pertanyaan ini','仅运营可配置客服':'Hanya admin yang dapat mengatur kontak bantuan',
 '请填写有效联系方式':'Isi kontak yang valid','配置已更新，请刷新':'Pengaturan diperbarui. Muat ulang',
 '深圳仓收货合包后核定头程和尾程；只付款一次':'Biaya awal dan akhir diverifikasi setelah penerimaan dan penggabungan di Shenzhen; bayar sekali.',
 '头程预估已更新，尾程费用待仓库复核':'Perkiraan biaya awal diperbarui. Biaya akhir menunggu verifikasi gudang.',
 '等待客户合计付款一次':'Menunggu pelanggan membayar seluruh tagihan sekaligus.',
 '等待运营核实，尚未确认付款成功':'Menunggu verifikasi admin. Pembayaran belum dikonfirmasi.',
 '模拟付款成功，未发生真实资金交易；进入待出货':'Pembayaran simulasi disetujui tanpa transfer nyata; siap dikirim.',
 '付款成功，进入待出货':'Pembayaran dikonfirmasi; siap dikirim.',
 '凭证已提交，等待运营审核；请勿重复转账':'Bukti terkirim. Tunggu verifikasi admin; jangan transfer lagi.',
 '测试审核通过，已通知商家及仓库':'Simulasi disetujui. Pelanggan dan gudang sudah diberi tahu.',
 '审核通过，已通知商家及仓库':'Pembayaran disetujui. Pelanggan dan gudang sudah diberi tahu.',
 '凭证已退回，请通知商家补充':'Bukti dikembalikan. Minta pelanggan melengkapinya.',
 '请选择至少一个包裹并填写收件地址':'Pilih setidaknya satu paket dan isi alamat penerima.',
 '保存已提交，但刷新失败，请刷新核对':'Perubahan sudah dikirim tetapi pemuatan gagal. Muat ulang untuk memeriksa.',
 '操作失败':'Operasi gagal',
 '10条 / 页':'10 data / halaman','20条 / 页':'20 data / halaman','50条 / 页':'50 data / halaman'
});
function indonesianFor(s){
 if(idLocale[s])return idLocale[s];
 let time=s.match(/^审核时间：(.*)$/);if(time)return 'Waktu verifikasi: '+time[1];
 time=s.match(/^(\d{4}\/\d{1,2}\/\d{1,2}.*) · 测试$/);if(time)return time[1]+' · Pengujian';
 let m=s.match(/^第 (\d+) 组外箱$/);if(m)return `Kelompok karton ${m[1]}`;
 m=s.match(/^第 (\d+) 页$/);if(m)return `Halaman ${m[1]}`;
 m=s.match(/^共 (\d+) 条.*?(\d+).*?(\d+)/);if(m)return `${m[1]} data, menampilkan ${m[2]}–${m[3]}`;
 m=s.match(/^共 (\d+) 个包裹 · 显示 (\d+)–(\d+) 条 · 第 (\d+) \/ (\d+) 页$/);if(m)return `${m[1]} paket · menampilkan ${m[2]}–${m[3]} · halaman ${m[4]} / ${m[5]}`;
 m=s.match(/^(待审核|已通过|需补充|全部)（(\d+)）$/);if(m)return `${idLocale[m[1]]} (${m[2]})`;
 m=s.match(/^审核 (.+)$/);if(m)return 'Verifikasi '+m[1];
 m=s.match(/^测试 · (.+)$/);if(m&&idLocale[m[1]])return 'Pengujian · '+idLocale[m[1]];
 m=s.match(/^商家填写的流水：(.*)$/);if(m)return 'Referensi pelanggan: '+(m[1]==='未填写'?'belum diisi':m[1]);
 m=s.match(/^备注：(.*)$/);if(m)return 'Catatan: '+(m[1]==='无'?'tidak ada':m[1]);
 if(/^自动同步（每10秒）/.test(s))return s.replace('自动同步（每10秒）','Sinkronisasi otomatis (10 detik)');
 if(/^实时同步/.test(s))return s.replace('实时同步','Sinkronisasi langsung');
 if(/^正在同步进度/.test(s))return 'Menyinkronkan status…';
 if(/^自动同步已开启/.test(s))return 'Sinkronisasi otomatis ditunda saat mengisi formulir';
 if(/^更新暂不可用/.test(s))return 'Pembaruan gagal, akan dicoba lagi';
 if(/^网络已断开/.test(s))return 'Jaringan terputus, sinkronisasi dilanjutkan setelah tersambung';
 return null;
}
function translatedText(s){const id=indonesianFor(String(s));return id?bi(s,id):raw(s)}
function localizeKnownDom(root=document.body){
 if(!root||typeof localeMarkup!=='function')return;
 const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
 while(walk.nextNode())nodes.push(walk.currentNode);
 for(const n of nodes){
  const p=n.parentElement;if(!p||p.closest('[data-i18n],[data-user-content],script,style,textarea,input,option'))continue;
  const text=n.textContent.trim(),id=indonesianFor(text);if(!id)continue;
  const el=document.createElement('span');el.innerHTML=bi(text,id);n.replaceWith(el.firstChild);
 }
}
const combinedOriginalToast=toast;
toast=function(message,duration=2200){combinedOriginalToast(message,duration);const t=$('#toast'),id=indonesianFor(String(message));if(t&&id)t.innerHTML=bi(message,id)};
// Observe dynamic payment panels, status, auth modal and toasts without altering input values.
if(typeof MutationObserver!=='undefined'){
 const localeObserver=new MutationObserver(()=>{localeObserver.disconnect();localizeKnownDom();localeObserver.observe(document.body,{childList:true,subtree:true,characterData:true})});
 localeObserver.observe(document.body,{childList:true,subtree:true,characterData:true});
}
const combinedLoginPrevious=loginPage;
loginPage=function(){return combinedLoginPrevious().replace('头程付款出货，尾程独立结算、查询物流','头程尾程复核后一次付款，再出货与查询物流')};
